import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_organization, get_current_role, get_current_user
from app.models import (
    DetectionStatus,
    DeviceType,
    LocationStatus,
    MemberRole,
    Organization,
    OrganizationMember,
    PotholeDetection,
    User,
)
from app.schemas import (
    BBox,
    BatchItemResult,
    BatchUploadResponse,
    ClearMapResponse,
    DeleteDetectionResponse,
    DetectionCreate,
    DetectionResponse,
    DetectionStatusUpdate,
    StatsResponse,
    UploadResponse,
)
from app.services.access_control import is_platform_owner, scoped_detections_query
from app.services.auth_service import effective_organization_id
from app.services.batch_media import (
    MAX_BATCH_IMAGES,
    MAX_VIDEO_FRAMES,
    extract_video_frames,
    interpolate_gps,
    is_image_filename,
    is_video_filename,
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


def _reporter_names(db: Session, items: list) -> dict[int, str]:
    ids = {d.reporter_user_id for d in items if getattr(d, "reporter_user_id", None)}
    if not ids:
        return {}
    rows = db.query(User.id, User.full_name).filter(User.id.in_(ids)).all()
    return {uid: name for uid, name in rows}


def _to_response(
    d,
    organization_id: int | None = None,
    reporter_names: dict[int, str] | None = None,
) -> DetectionResponse:
    data = DetectionResponse.model_validate(d)
    org_id = organization_id or getattr(d, "organization_id", None)
    rep_id = getattr(d, "reporter_user_id", None)
    rep_name = reporter_names.get(rep_id) if reporter_names and rep_id else None
    return data.model_copy(
        update={
            "image_url": _image_url(d.image_path, org_id),
            "reporter_user_id": rep_id,
            "reporter_name": rep_name,
        }
    )


def _to_responses(db: Session, items: list, org_id: int) -> list[DetectionResponse]:
    names = _reporter_names(db, items)
    return [_to_response(d, org_id, names) for d in items]


@router.get("", response_model=list[DetectionResponse])
def list_detections(
    min_lat: float = Query(...),
    min_lon: float = Query(...),
    max_lat: float = Query(...),
    max_lon: float = Query(...),
    org: Organization = Depends(get_current_organization),
    user: User = Depends(get_current_user),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    items = (
        scoped_detections_query(db, org.id, user, role)
        .filter(PotholeDetection.latitude >= min_lat)
        .filter(PotholeDetection.latitude <= max_lat)
        .filter(PotholeDetection.longitude >= min_lon)
        .filter(PotholeDetection.longitude <= max_lon)
        .order_by(PotholeDetection.created_at.desc())
        .limit(500)
        .all()
    )
    return _to_responses(db, items, org.id)


@router.get("/recent", response_model=list[DetectionResponse])
def recent_detections(
    limit: int = 50,
    org: Organization = Depends(get_current_organization),
    user: User = Depends(get_current_user),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    items = (
        scoped_detections_query(db, org.id, user, role)
        .order_by(PotholeDetection.created_at.desc())
        .limit(limit)
        .all()
    )
    names = _reporter_names(db, items)
    payload = [_to_response(d, org.id, names).model_dump(mode="json") for d in items]
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )


@router.get("/stats", response_model=StatsResponse)
def detection_stats(
    org: Organization = Depends(get_current_organization),
    user: User = Depends(get_current_user),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    reporter_user_id = None if is_platform_owner(user, role) else user.id
    org_id = effective_organization_id(db, org.id, user, role)
    data = StatsResponse(**get_stats(db, org_id, reporter_user_id=reporter_user_id))
    return JSONResponse(
        content=data.model_dump(mode="json"),
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )


@router.get("/all", response_model=list[DetectionResponse])
def all_detections(
    limit: int = Query(1000, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    org: Organization = Depends(get_current_organization),
    user: User = Depends(get_current_user),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    """Org-wide for platform owner; own uploads only for field users."""
    items = (
        scoped_detections_query(db, org.id, user, role)
        .order_by(PotholeDetection.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    names = _reporter_names(db, items)
    payload = [_to_response(d, org.id, names).model_dump(mode="json") for d in items]
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )


def _member_role(db: Session, org_id: int, user_id: int) -> MemberRole | None:
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
        .first()
    )
    return membership.role if membership else None


@router.delete("/clear", response_model=ClearMapResponse)
async def clear_map(
    org: Organization = Depends(get_current_organization),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not is_platform_owner(user, _member_role(db, org.id, user.id)):
        raise HTTPException(status_code=403, detail="مسح جميع النقاط متاح لمالك المنصة فقط")
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
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    detection = (
        db.query(PotholeDetection)
        .filter(
            PotholeDetection.id == detection_id,
            PotholeDetection.organization_id == org.id,
        )
        .first()
    )
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    if not is_platform_owner(user, _member_role(db, org.id, user.id)):
        if detection.reporter_user_id != user.id:
            raise HTTPException(status_code=403, detail="لا يمكن حذف نقطة أضافها مستخدم آخر")

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
    user: User = Depends(get_current_user),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    det = (
        scoped_detections_query(db, org.id, user, role)
        .filter(PotholeDetection.id == detection_id)
        .first()
    )
    if not det:
        raise HTTPException(status_code=404, detail="Detection not found")
    det.detection_status = payload.detection_status
    if payload.detection_status == DetectionStatus.verified:
        det.cloud_verified = True
    db.commit()
    db.refresh(det)
    resp = _to_response(det, org.id, _reporter_names(db, [det]))
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
    response = _to_response(detection, org.id, _reporter_names(db, [detection]))
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


@router.post("/upload-batch", response_model=BatchUploadResponse)
async def upload_batch_and_detect(
    files: list[UploadFile] = File(default=[]),
    file: UploadFile | None = File(None),
    device_type: DeviceType = Form(DeviceType.mms),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    end_latitude: float | None = Form(None),
    end_longitude: float | None = Form(None),
    bearing: float | None = Form(None),
    source_id: str | None = Form(None),
    mission_id: str | None = Form(None),
    frame_interval_sec: float = Form(1.0),
    max_video_frames: int | None = Form(None),
    org: Organization = Depends(get_current_organization),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Batch ingest for MMS / drone / dashboard — images and/or a video."""
    incoming: list[UploadFile] = list(files or [])
    if file is not None:
        incoming.append(file)
    if not incoming:
        raise HTTPException(status_code=400, detail="No files uploaded")

    video_frame_cap = MAX_VIDEO_FRAMES
    if max_video_frames is not None:
        video_frame_cap = max(1, min(int(max_video_frames), MAX_VIDEO_FRAMES))

    mission = (mission_id or source_id or "").strip() or None
    items: list[BatchItemResult] = []
    all_detections: list[DetectionResponse] = []
    work_units: list[tuple[bytes, str, float | None, float | None]] = []

    image_files: list[UploadFile] = []
    video_files: list[UploadFile] = []
    for f in incoming:
        name = f.filename or ""
        if is_video_filename(name):
            video_files.append(f)
        elif is_image_filename(name) or not name:
            image_files.append(f)
        else:
            # Unknown extension: try as image if small content sniff later
            image_files.append(f)

    if len(image_files) > MAX_BATCH_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"حد أقصى {MAX_BATCH_IMAGES} صورة في الدفعة الواحدة",
        )
    if len(video_files) > 1:
        raise HTTPException(status_code=400, detail="ارفع فيديو واحد فقط في كل دفعة")

    for f in image_files:
        content = await f.read()
        if not content:
            items.append(
                BatchItemResult(
                    filename=f.filename or "empty",
                    ok=False,
                    error="Empty file",
                )
            )
            continue
        work_units.append((content, Path(f.filename or "upload.jpg").name, None, None))

    for vf in video_files:
        raw = await vf.read()
        try:
            frames = extract_video_frames(
                raw,
                original_name=vf.filename or "mission.mp4",
                interval_sec=frame_interval_sec,
                max_frames=video_frame_cap,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        total = len(frames)
        for fr in frames:
            lat, lon = interpolate_gps(
                fr.frame_index,
                total,
                latitude,
                longitude,
                end_latitude,
                end_longitude,
            )
            work_units.append((fr.content, fr.filename, lat, lon))

    if not work_units and not items:
        raise HTTPException(status_code=400, detail="لا ملفات صالحة للمعالجة")

    # Assign per-image GPS: explicit frame GPS, else EXIF inside impl, else fallback form GPS
    total_units = len(work_units)
    for idx, (content, filename, frame_lat, frame_lon) in enumerate(work_units):
        if frame_lat is None or frame_lon is None:
            # Image batch: interpolate along path if end GPS given
            frame_lat, frame_lon = interpolate_gps(
                idx,
                total_units,
                latitude,
                longitude,
                end_latitude,
                end_longitude,
            )
        unit_source = mission
        if mission and total_units > 1:
            unit_source = f"{mission}#{idx + 1}"

        try:
            result = await _upload_and_detect_impl(
                content=content,
                filename=filename,
                device_type=device_type,
                device_lat=frame_lat,
                device_lon=frame_lon,
                bearing=bearing,
                source_id=unit_source,
                edge_detections=None,
                anomaly_type=None,
                org=org,
                user=user,
                db=db,
            )
            items.append(
                BatchItemResult(
                    filename=filename,
                    ok=True,
                    upload_id=result.upload_id,
                    detection_count=len(result.detections),
                    message=result.message,
                )
            )
            all_detections.extend(result.detections)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            items.append(BatchItemResult(filename=filename, ok=False, error=detail))
        except Exception as exc:
            logger.exception("batch item failed: %s", filename)
            items.append(
                BatchItemResult(
                    filename=filename,
                    ok=False,
                    error=f"{type(exc).__name__}: {exc}",
                )
            )

    succeeded = sum(1 for i in items if i.ok)
    failed = sum(1 for i in items if not i.ok)
    holes = sum(1 for d in all_detections if d.class_name != "photo")
    src = device_type.value
    msg = (
        f"دفعة {src}: عُولج {succeeded}/{len(items)} ملف — "
        f"{holes} كشف — "
        + (f"مهمة {mission}" if mission else "بدون رقم مهمة")
    )
    if failed:
        msg += f" — فشل {failed}"

    return BatchUploadResponse(
        mission_id=mission,
        device_type=device_type,
        processed=len(items),
        succeeded=succeeded,
        failed=failed,
        total_detections=len(all_detections),
        items=items,
        detections=all_detections,
        message=msg,
    )


async def _upload_and_detect_impl(
    *,
    file: UploadFile | None = None,
    content: bytes | None = None,
    filename: str | None = None,
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
    if content is None:
        if file is None:
            raise HTTPException(status_code=400, detail="Empty file")
        content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    exif_lat, exif_lon = extract_gps_from_bytes(content)
    content = normalize_image_for_processing(content)
    raw_name = filename or (file.filename if file else None) or "upload.jpg"
    filename = Path(raw_name).name or "upload.jpg"
    if not filename.lower().endswith((".jpg", ".jpeg")):
        filename = f"{Path(filename).stem or 'upload'}.jpg"

    location_source = "none"
    has_map_location = False
    map_lat: float | None = None
    map_lon: float | None = None

    # Prefer EXIF GPS (where the photo was taken) over live device coordinates,
    # so album uploads from phones land on the correct map spot.
    if exif_lat is not None and exif_lon is not None:
        map_lat, map_lon = exif_lat, exif_lon
        has_map_location = True
        location_source = "exif"
    elif device_lat is not None and device_lon is not None:
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
        resp = _to_response(detection, org.id, {user.id: user.full_name})
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
        resp = _to_response(photo_marker, org.id, {user.id: user.full_name})
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
