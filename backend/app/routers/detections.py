import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_organization, get_current_user
from app.models import DetectionStatus, DeviceType, LocationStatus, Organization, PotholeDetection, User
from app.schemas import (
    BBox,
    ClearMapResponse,
    DeleteDetectionResponse,
    DetectionCreate,
    DetectionResponse,
    DetectionStatusUpdate,
    StatsResponse,
    UploadResponse,
)
from app.services.exif_geo import extract_gps_from_bytes, normalize_image_for_processing
from app.services.geo_service import (
    clear_all_map_data,
    create_detection,
    delete_detection,
    get_detections_in_bounds,
    get_stats,
    save_training_sample,
    save_upload_file,
    save_upload_record,
)
from app.services.inference import (
    filter_detections,
    get_model_info,
    resolve_detection_status,
    run_inference,
)
from app.services.gamification import award_report_points, points_for_detection
from app.websocket import manager

router = APIRouter(prefix="/api/detections", tags=["detections"])
logger = logging.getLogger(__name__)


def _image_url(image_path: str | None, organization_id: int | None = None) -> str | None:
    if not image_path:
        return None
    p = Path(image_path)
    name = p.name
    if organization_id is not None and str(organization_id) in p.parts:
        return f"/api/uploads/{organization_id}/{name}"
    return f"/api/uploads/{name}"


def _to_response(d, organization_id: int | None = None) -> DetectionResponse:
    data = DetectionResponse.model_validate(d)
    org_id = organization_id or getattr(d, "organization_id", None)
    return data.model_copy(update={"image_url": _image_url(d.image_path, org_id)})


@router.get("", response_model=list[DetectionResponse])
def list_detections(
    min_lat: float = Query(...),
    min_lon: float = Query(...),
    max_lat: float = Query(...),
    max_lon: float = Query(...),
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    items = get_detections_in_bounds(db, min_lat, min_lon, max_lat, max_lon, org.id)
    return [_to_response(d, org.id) for d in items]


@router.get("/recent", response_model=list[DetectionResponse])
def recent_detections(
    limit: int = 50,
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    items = (
        db.query(PotholeDetection)
        .filter(PotholeDetection.organization_id == org.id)
        .order_by(PotholeDetection.created_at.desc())
        .limit(limit)
        .all()
    )
    payload = [_to_response(d, org.id).model_dump(mode="json") for d in items]
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )


@router.get("/stats", response_model=StatsResponse)
def detection_stats(
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    data = StatsResponse(**get_stats(db, org.id))
    return JSONResponse(
        content=data.model_dump(mode="json"),
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )


@router.delete("/clear", response_model=ClearMapResponse)
async def clear_map(
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    result = clear_all_map_data(db, org.id, delete_files=True)
    await manager.broadcast(org.id, {"type": "map_cleared"})
    return ClearMapResponse(
        message="تم مسح الخريطة وجميع الصور المحفوظة",
        **result,
    )


@router.delete("/{detection_id}", response_model=DeleteDetectionResponse)
async def remove_detection(
    detection_id: int,
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    result = delete_detection(db, detection_id, org.id, delete_file=True)
    if not result:
        raise HTTPException(status_code=404, detail="Detection not found")
    await manager.broadcast(
        org.id,
        {
            "type": "detections_deleted",
            "data": {"ids": result["deleted_ids"]},
        },
    )
    count = result["deleted_count"]
    msg = (
        f"تم حذف الصورة وجميع الكشوفات المرتبطة ({count})"
        if count > 1
        else "تم حذف الصورة من الخريطة"
    )
    return DeleteDetectionResponse(
        message=msg,
        id=result["id"],
        deleted_ids=result["deleted_ids"],
        deleted_count=count,
        files_deleted=result["files_deleted"],
    )


@router.patch("/{detection_id}/status", response_model=DetectionResponse)
async def update_detection_status(
    detection_id: int,
    payload: DetectionStatusUpdate,
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    det = (
        db.query(PotholeDetection)
        .filter(
            PotholeDetection.id == detection_id,
            PotholeDetection.organization_id == org.id,
        )
        .first()
    )
    if not det:
        raise HTTPException(status_code=404, detail="Detection not found")
    det.detection_status = payload.detection_status
    if payload.detection_status == DetectionStatus.verified:
        det.cloud_verified = True
    db.commit()
    db.refresh(det)
    resp = _to_response(det, org.id)
    await manager.broadcast(org.id, {"type": "detection_updated", "data": resp.model_dump()})
    return resp


@router.post("", response_model=DetectionResponse)
async def create_detection_endpoint(
    payload: DetectionCreate,
    org: Organization = Depends(get_current_organization),
    db: Session = Depends(get_db),
):
    cloud_verified = False
    status = DetectionStatus.detected

    if payload.confidence >= 0.7:
        cloud_verified = True
        status = DetectionStatus.verified

    detection = create_detection(
        db,
        payload,
        cloud_verified=cloud_verified,
        detection_status=status,
        organization_id=org.id,
    )
    response = _to_response(detection, org.id)
    await manager.broadcast(org.id, {"type": "new_detection", "data": response.model_dump()})
    return response


@router.post("/upload", response_model=UploadResponse)
async def upload_and_detect(
    file: UploadFile = File(...),
    device_type: DeviceType = Form(DeviceType.phone),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    lat: float | None = Query(None),
    lng: float | None = Query(None),
    bearing: float | None = Form(None),
    source_id: str | None = Form(None),
    edge_detections: str | None = Form(None),
    anomaly_type: str | None = Form(None),
    org: Organization = Depends(get_current_organization),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return await _upload_and_detect_impl(
            file=file,
            device_type=device_type,
            device_lat=latitude if latitude is not None else lat,
            device_lon=longitude if longitude is not None else lng,
            bearing=bearing,
            source_id=source_id,
            edge_detections=edge_detections,
            anomaly_type=anomaly_type,
            org=org,
            user=user,
            db=db,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("upload failed for org=%s", org.id)
        raise HTTPException(
            status_code=500,
            detail=f"فشل رفع الصورة — أعد تشغيل START.bat ({type(exc).__name__})",
        ) from exc


async def _upload_and_detect_impl(
    *,
    file: UploadFile,
    device_type: DeviceType,
    device_lat: float | None,
    device_lon: float | None,
    bearing: float | None,
    source_id: str | None,
    edge_detections: str | None,
    anomaly_type: str | None,
    org: Organization,
    user: User,
    db: Session,
) -> UploadResponse:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    exif_lat, exif_lon = extract_gps_from_bytes(content)
    content = normalize_image_for_processing(content)
    filename = Path(file.filename or "upload.jpg").name or "upload.jpg"
    if not filename.lower().endswith((".jpg", ".jpeg")):
        filename = f"{Path(filename).stem or 'upload'}.jpg"

    location_source = "exif"
    has_map_location = exif_lat is not None and exif_lon is not None
    map_lat = exif_lat if has_map_location else None
    map_lon = exif_lon if has_map_location else None

    if not has_map_location and device_lat is not None and device_lon is not None:
        if -90 <= device_lat <= 90 and -180 <= device_lon <= 180:
            map_lat, map_lon = device_lat, device_lon
            has_map_location = True
            location_source = "device_gps"

    saved_path = save_upload_file(content, filename, org.id)
    save_training_sample(
        content,
        device_type.value,
        map_lat,
        map_lon,
        {
            "source_id": source_id,
            "bearing": bearing,
            "organization_id": org.id,
            "location_source": location_source if has_map_location else "none",
        },
    )

    try:
        cloud_detections = run_inference(saved_path)
    except Exception as exc:
        logger.warning("inference failed: %s", exc)
        cloud_detections = []
    results: list[DetectionResponse] = []
    mapped_count = 0

    if edge_detections:
        import json

        try:
            edge_list = json.loads(edge_detections)
        except json.JSONDecodeError:
            edge_list = []
    else:
        edge_list = []

    all_dets = filter_detections(cloud_detections if cloud_detections else edge_list)
    has_potholes = len(all_dets) > 0

    for det in all_dets:
        conf = det.get("confidence", 0.5)
        edge_conf = det.get("edge_confidence", conf)
        cloud_verified, status = resolve_detection_status(conf, edge_conf)

        payload = DetectionCreate(
            latitude=map_lat,
            longitude=map_lon,
            confidence=conf,
            device_type=device_type,
            bbox=BBox(
                x=float(det["x"]),
                y=float(det["y"]),
                w=float(det["w"]),
                h=float(det["h"]),
                confidence=conf,
                class_name=str(det.get("class_name", "pothole")),
            ),
            edge_confidence=edge_conf,
            bearing=bearing,
            source_id=source_id,
            location_status=(
                LocationStatus.confirmed
                if has_map_location
                else LocationStatus.uncertain
            ),
            metadata={"anomaly_type": anomaly_type} if anomaly_type else None,
        )
        detection = create_detection(
            db,
            payload,
            image_path=saved_path,
            cloud_verified=cloud_verified,
            detection_status=status,
            organization_id=org.id,
            reporter_user_id=user.id,
        )
        award_report_points(
            db,
            user.id,
            org.id,
            confirmed=cloud_verified or status == DetectionStatus.verified,
            points=points_for_detection(detection),
        )
        resp = _to_response(detection, org.id)
        results.append(resp)
        if has_map_location:
            mapped_count += 1
        await manager.broadcast(org.id, {"type": "new_detection", "data": resp.model_dump()})

    # No pothole: still pin the photo on the map (blue marker)
    if has_map_location and not has_potholes:
        photo_marker = create_detection(
            db,
            DetectionCreate(
                latitude=map_lat,
                longitude=map_lon,
                confidence=0.0,
                device_type=device_type,
                class_name="photo",
                bearing=bearing,
                source_id=source_id,
                location_status=LocationStatus.confirmed,
                metadata={"pothole_count": 0, "location_source": location_source},
            ),
            image_path=saved_path,
            cloud_verified=False,
            detection_status=DetectionStatus.detected,
            organization_id=org.id,
            reporter_user_id=user.id,
        )
        resp = _to_response(photo_marker, org.id)
        results.append(resp)
        mapped_count = 1
        await manager.broadcast(org.id, {"type": "new_detection", "data": resp.model_dump()})

    upload = save_upload_record(
        db, device_type, saved_path, map_lat, map_lon, len(results), org.id
    )

    if not has_map_location:
        hole_txt = f"اكتُشف {len(results)} حفرة" if has_potholes else "لا حفر"
        msg = f"تم رفع الصورة — {hole_txt} — بدون موقع (اسمح بالموقع أو استخدم الألبوم)"
    elif not has_potholes:
        msg = "تمت إضافة الصورة على الخريطة — لا يوجد حفر"
    elif has_potholes:
        best = max((d.confidence for d in results if d.class_name != "photo"), default=0)
        pct = int(best * 100)
        top = next((r for r in results if r.class_name != "photo"), None)
        sev = top.severity if top else "low"
        rut = int(top.rut_score) if top else 0
        msg = (
            f"تم اكتشاف {len([r for r in results if r.class_name != 'photo'])} عطل "
            f"(ثقة {pct}% | RUT {rut} | خطورة {sev}) — على الخريطة"
        )

    return UploadResponse(
        upload_id=upload.id,
        detections=results,
        message=msg,
    )
