"""Municipality PDF / HTML reports for RUTRIX B2B."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import DetectionStatus, Organization, PotholeDetection

logger = logging.getLogger(__name__)

_APP_FONTS = Path(__file__).resolve().parent.parent / "assets" / "fonts"
_FONT_CANDIDATES = [
    _APP_FONTS / "arial.ttf",
    _APP_FONTS / "DejaVuSans.ttf",
    Path(r"C:\Windows\Fonts\arial.ttf"),
    Path(r"C:\Windows\Fonts\segoeui.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
    Path("/Library/Fonts/Arial Unicode.ttf"),
]

_SEV_AR = {
    "low": "منخفضة",
    "medium": "متوسطة",
    "high": "عالية",
    "critical": "حرجة",
}


def _severity_label(s: str) -> str:
    return _SEV_AR.get(s or "low", s or "low")


def _fmt_coord(lat: float | None, lon: float | None) -> str:
    if lat is None or lon is None:
        return "بدون موقع"
    return f"{lat:.5f}, {lon:.5f}"


def _fmt_money(val: float | None) -> str:
    return f"${(val or 0):,.0f}"


def _ascii_safe(text: str) -> str:
    return text.encode("ascii", "replace").decode("ascii")


def _ar(text: str) -> str:
    """Shape Arabic for PDF (RTL + joined glyphs)."""
    if not text:
        return ""
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display

        return get_display(arabic_reshaper.reshape(text))
    except Exception:
        return text


def _find_unicode_font() -> Path | None:
    for path in _FONT_CANDIDATES:
        if path.is_file():
            return path
    return None


def _group_potholes_for_report(rows: list[PotholeDetection]) -> list[dict]:
    """Group by image; label صورة N and حفرة M (each hole keeps its own metrics)."""
    groups: dict[str, list[PotholeDetection]] = {}
    for d in rows:
        key = d.image_path or f"id:{d.id}"
        groups.setdefault(key, []).append(d)

    ordered_groups = sorted(
        groups.items(),
        key=lambda kv: min(
            (x.created_at for x in kv[1] if x.created_at is not None),
            default=datetime.min.replace(tzinfo=timezone.utc),
        ),
    )

    priorities: list[dict] = []
    for image_number, (_key, potholes) in enumerate(ordered_groups, start=1):
        potholes_sorted = sorted(
            potholes,
            key=lambda d: (-(d.confidence or 0), d.id),
        )
        multi = len(potholes_sorted) > 1
        for pothole_number, d in enumerate(potholes_sorted, start=1):
            if multi:
                display_label = f"صورة {image_number} — حفرة {pothole_number}"
            else:
                display_label = f"صورة {image_number}"
            priorities.append(
                {
                    "id": d.id,
                    "image_number": image_number,
                    "pothole_number": pothole_number,
                    "potholes_in_photo": len(potholes_sorted),
                    "image_label": f"صورة {image_number}",
                    "pothole_label": f"حفرة {pothole_number}",
                    "display_label": display_label,
                    "severity": d.severity or "low",
                    "severity_label": _severity_label(d.severity),
                    "rut_score": round(float(d.rut_score or 0), 1),
                    "priority_rank": d.priority_rank or 0,
                    "class_name": d.anomaly_type or d.class_name or "pothole",
                    "latitude": d.latitude,
                    "longitude": d.longitude,
                    "depth_cm": d.estimated_depth_cm,
                    "width_cm": d.estimated_width_cm,
                    "repair_min": d.repair_cost_min or 0,
                    "repair_max": d.repair_cost_max or 0,
                    "vehicle_risk": d.vehicle_risk_score or 0,
                    "days_to_critical": d.predicted_days_to_critical,
                    "confirmations": d.confirmation_count or 1,
                }
            )

    priorities.sort(
        key=lambda p: (p["priority_rank"], p["rut_score"]),
        reverse=True,
    )
    return priorities


def build_report_data(db: Session, org: Organization, limit: int = 100) -> dict:
    rows = (
        db.query(PotholeDetection)
        .filter(PotholeDetection.organization_id == org.id)
        .filter(PotholeDetection.class_name != "photo")
        .filter(PotholeDetection.detection_status != DetectionStatus.rejected)
        .order_by(PotholeDetection.created_at.asc())
        .limit(limit)
        .all()
    )
    priorities = _group_potholes_for_report(rows)
    total_potholes = len(rows)

    total_repair_min = sum(d.repair_cost_min or 0 for d in rows)
    total_repair_max = sum(d.repair_cost_max or 0 for d in rows)
    by_severity: dict[str, int] = {}
    for d in rows:
        key = d.severity or "low"
        by_severity[key] = by_severity.get(key, 0) + 1
    critical = [d for d in rows if d.severity == "critical"]
    growing = [d for d in rows if d.evolution_stage == "growing"]

    image_keys = {d.image_path or f"id:{d.id}" for d in rows}
    photo_only = (
        db.query(PotholeDetection.image_path)
        .filter(PotholeDetection.organization_id == org.id)
        .filter(PotholeDetection.class_name == "photo")
        .filter(PotholeDetection.detection_status != DetectionStatus.rejected)
        .all()
    )
    for (path,) in photo_only:
        if path and path not in image_keys:
            image_keys.add(path)
    total_inspections = len(image_keys)

    return {
        "org_name": org.name,
        "org_slug": org.slug,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "total_issues": total_potholes,
        "total_potholes": total_potholes,
        "total_inspections": total_inspections,
        "unique_images_with_potholes": len({d.image_path or f"id:{d.id}" for d in rows}),
        "by_severity": by_severity,
        "total_repair_min": total_repair_min,
        "total_repair_max": total_repair_max,
        "critical_count": len(critical),
        "growing_count": len(growing),
        "priorities": priorities[:80],
    }


def generate_html_report(data: dict) -> str:
    rows = ""
    for p in data["priorities"]:
        rows += f"""
    <tr>
      <td>{p['display_label']}</td>
      <td>{p['severity_label']}</td>
      <td>{p['rut_score']}</td>
      <td>{p['class_name']}</td>
      <td>{p['depth_cm'] or '-'} / {p['width_cm'] or '-'}</td>
      <td>{_fmt_money(p['repair_min'])} - {_fmt_money(p['repair_max'])}</td>
      <td>{_fmt_coord(p['latitude'], p['longitude'])}</td>
    </tr>"""

    sev_rows = "".join(
        f"<li>{_severity_label(k)}: {v}</li>" for k, v in data.get("by_severity", {}).items()
    )

    return f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>RUTRIX Report — {data['org_name']}</title>
  <style>
    body {{ font-family: 'Segoe UI', Tahoma, sans-serif; background:#0a1020; color:#e2e8f0; padding:32px; }}
    h1 {{ color:#22d3ee; }}
    .card {{ background:#121f35; border:1px solid #334155; border-radius:12px; padding:20px; margin:16px 0; }}
    table {{ width:100%; border-collapse:collapse; font-size:13px; }}
    th, td {{ border:1px solid #334155; padding:8px; text-align:right; }}
    th {{ background:#1e293b; color:#22d3ee; }}
    .metric {{ font-size:28px; font-weight:bold; color:#fbbf24; }}
  </style>
</head>
<body>
  <h1>RUTRIX — تقرير صيانة الطرق</h1>
  <p>{data['org_name']} | {data['generated_at']}</p>
  <div class="card">
    <p>إجمالي الكشوفات: <span class="metric">{data.get('total_inspections', data['total_issues'])}</span></p>
    <p>تم اكتشاف حفر: <span class="metric">{data.get('total_potholes', data['total_issues'])}</span></p>
    <p>عدد الصور: <span class="metric">{data.get('total_inspections', 0)}</span></p>
    <p>حرجة: {data['critical_count']} | قيد النمو: {data['growing_count']}</p>
    <p>تكلفة إصلاح تقديرية: {_fmt_money(data['total_repair_min'])} — {_fmt_money(data['total_repair_max'])}</p>
    <ul>{sev_rows}</ul>
  </div>
  <div class="card">
    <h2>أولويات الصيانة</h2>
    <table>
      <thead><tr>
        <th>الصورة / الحفرة</th><th>الخطورة</th><th>RUT</th><th>النوع</th>
        <th>عمق/عرض سم</th><th>تكلفة</th><th>إحداثيات</th>
      </tr></thead>
      <tbody>{rows or '<tr><td colspan="7">لا توجد كشوفات حفر</td></tr>'}</tbody>
    </table>
  </div>
  <p style="color:#64748b;font-size:12px">RUTRIX — Road Infrastructure Intelligence &amp; Asset Management Platform</p>
</body>
</html>"""


def _pdf_bytes(pdf) -> bytes:
    out = pdf.output()
    if isinstance(out, (bytes, bytearray)):
        return bytes(out)
    if isinstance(out, str):
        return out.encode("latin-1", errors="replace")
    raise TypeError(f"Unexpected fpdf output type: {type(out)}")


def _setup_pdf_font(pdf) -> str:
    font_path = _find_unicode_font()
    if font_path:
        pdf.add_font("rutrix", "", str(font_path))
        return "rutrix"
    return "Helvetica"


def _pdf_ar_line(pdf, family: str, size: int, text: str, *, bold: bool = False, ln: bool = False):
    """Write one Arabic-aware line (aligned right)."""
    if family == "Helvetica":
        pdf.set_font(family, "B" if bold else "", size)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(pdf.epw, 6, _ascii_safe(text))
    else:
        pdf.set_font(family, size=size + (1 if bold else 0))
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(pdf.epw, 6, _ar(text), align="R")
    if ln:
        pdf.ln(2)


def _render_pdf_table(pdf, family: str, data: dict) -> None:
    from fpdf.fonts import FontFace

    priorities = data.get("priorities") or []
    if not priorities:
        _pdf_ar_line(pdf, family, 11, "لا توجد كشوفات حفر في المنصة حالياً.", ln=True)
        return

    headings = FontFace(family=family, size_pt=9)
    pdf.set_font(family, size=8)

    with pdf.table(
        width=pdf.epw,
        col_widths=(2.1, 1.1, 0.7, 0.9, 1.2, 1.5, 1.5),
        text_align="RIGHT",
        first_row_as_headings=True,
        headings_style=headings,
        line_height=5,
    ) as table:
        header = table.row()
        for col in [
            "الصورة / الحفرة",
            "الخطورة",
            "RUT",
            "النوع",
            "عمق/عرض سم",
            "تكلفة",
            "إحداثيات",
        ]:
            header.cell(_ar(col))

        for p in priorities[:80]:
            row = table.row()
            row.cell(_ar(p["display_label"]))
            row.cell(_ar(p["severity_label"]))
            row.cell(str(p["rut_score"]))
            row.cell(p["class_name"])
            row.cell(f"{p['depth_cm'] or '-'} / {p['width_cm'] or '-'}")
            row.cell(f"{_fmt_money(p['repair_min'])} - {_fmt_money(p['repair_max'])}")
            row.cell(_ar(_fmt_coord(p["latitude"], p["longitude"])))


def generate_pdf_report(data: dict) -> bytes:
    try:
        return _generate_pdf_report_inner(data)
    except Exception as exc:
        logger.exception("Unicode PDF failed, using ASCII fallback: %s", exc)
        return _generate_pdf_report_ascii(data)


def _generate_pdf_report_inner(data: dict) -> bytes:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    family = _setup_pdf_font(pdf)

    _pdf_ar_line(pdf, family, 16, "RUTRIX — تقرير صيانة الطرق", bold=True, ln=True)
    _pdf_ar_line(
        pdf,
        family,
        11,
        f"الجهة: {data['org_name']} ({data.get('org_slug', '')})",
        ln=True,
    )
    _pdf_ar_line(pdf, family, 11, f"تاريخ التوليد: {data['generated_at']}", ln=True)
    pdf.ln(3)

    _pdf_ar_line(
        pdf,
        family,
        12,
        f"إجمالي الكشوفات: {data.get('total_inspections', data['total_issues'])}",
        bold=True,
        ln=True,
    )
    _pdf_ar_line(
        pdf,
        family,
        12,
        f"تم اكتشاف حفر: {data.get('total_potholes', data['total_issues'])}",
        bold=True,
        ln=True,
    )
    _pdf_ar_line(
        pdf,
        family,
        11,
        f"عدد الصور: {data.get('total_inspections', 0)}",
        ln=True,
    )
    _pdf_ar_line(
        pdf,
        family,
        11,
        f"حرجة: {data['critical_count']} | قيد النمو: {data['growing_count']}",
        ln=True,
    )
    _pdf_ar_line(
        pdf,
        family,
        11,
        f"تكلفة إصلاح تقديرية: {_fmt_money(data['total_repair_min'])} — {_fmt_money(data['total_repair_max'])}",
        ln=True,
    )

    sev_parts = [
        f"{_severity_label(k)}: {v}" for k, v in data.get("by_severity", {}).items()
    ]
    if sev_parts:
        _pdf_ar_line(pdf, family, 11, "توزيع الخطورة: " + " | ".join(sev_parts), ln=True)

    pdf.ln(4)
    _pdf_ar_line(pdf, family, 13, "أولويات الصيانة", bold=True, ln=True)
    pdf.ln(2)
    _render_pdf_table(pdf, family, data)

    content = _pdf_bytes(pdf)
    if content[:4] != b"%PDF":
        raise ValueError("PDF generation produced invalid output")
    return content


def _generate_pdf_report_ascii(data: dict) -> bytes:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "RUTRIX Road Maintenance Report", ln=True)
    pdf.set_font("Helvetica", size=11)
    pdf.cell(0, 8, f"Org: {_ascii_safe(data.get('org_name', ''))} ({data.get('org_slug', '')})", ln=True)
    pdf.cell(0, 8, f"Generated: {data['generated_at']}", ln=True)
    pdf.ln(4)
    pdf.cell(0, 8, f"Inspections: {data.get('total_inspections', data['total_issues'])}", ln=True)
    pdf.cell(0, 8, f"Potholes detected: {data.get('total_potholes', data['total_issues'])}", ln=True)
    pdf.cell(0, 8, f"Unique priorities: {data['total_issues']}", ln=True)
    pdf.cell(0, 8, f"Critical: {data['critical_count']} | Growing: {data['growing_count']}", ln=True)
    pdf.cell(
        0,
        8,
        f"Repair estimate: {_fmt_money(data['total_repair_min'])} - {_fmt_money(data['total_repair_max'])}",
        ln=True,
    )
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Maintenance priorities", ln=True)
    pdf.set_font("Helvetica", size=8)
    cols = ["Image/Pothole", "Severity", "RUT", "Type", "Depth/Width", "Cost", "Coords"]
    pdf.cell(0, 6, " | ".join(cols), ln=True)
    for p in data.get("priorities", [])[:80]:
        line = _ascii_safe(
            " | ".join(
                [
                    str(p.get("display_label", p["id"])),
                    str(p.get("severity", "")),
                    str(p["rut_score"]),
                    str(p.get("class_name", "")),
                    f"{p.get('depth_cm', '-')} / {p.get('width_cm', '-')}",
                    f"{_fmt_money(p['repair_min'])} - {_fmt_money(p['repair_max'])}",
                    _fmt_coord(p["latitude"], p["longitude"]),
                ]
            )
        )
        pdf.multi_cell(pdf.epw, 5, line)
    content = _pdf_bytes(pdf)
    if content[:4] != b"%PDF":
        raise ValueError("ASCII PDF fallback failed")
    return content
