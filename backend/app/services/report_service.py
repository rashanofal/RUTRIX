"""Municipality PDF / HTML reports for RUTRIX B2B."""

from __future__ import annotations

import base64
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import DetectionStatus, Organization, PotholeDetection

logger = logging.getLogger(__name__)

_STATIC = Path(__file__).resolve().parent.parent / "static"
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


def _logo_path() -> Path | None:
    for path in (_STATIC / "logo.png", _STATIC / "logo-mark.png"):
        if path.is_file():
            return path
    return None


def _logo_data_uri() -> str:
    path = _logo_path()
    if not path:
        return ""
    mime = "image/png"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _group_potholes_for_report(rows: list[PotholeDetection]) -> list[dict]:
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
        potholes_sorted = sorted(potholes, key=lambda d: (-(d.confidence or 0), d.id))
        multi = len(potholes_sorted) > 1
        for pothole_number, d in enumerate(potholes_sorted, start=1):
            display_label = (
                f"صورة {image_number} — حفرة {pothole_number}"
                if multi
                else f"صورة {image_number}"
            )
            priorities.append(
                {
                    "id": d.id,
                    "display_label": display_label,
                    "severity": d.severity or "low",
                    "severity_label": _severity_label(d.severity),
                    "rut_score": round(float(d.rut_score or 0), 1),
                    "class_name": d.anomaly_type or d.class_name or "pothole",
                    "latitude": d.latitude,
                    "longitude": d.longitude,
                    "depth_cm": d.estimated_depth_cm,
                    "width_cm": d.estimated_width_cm,
                    "repair_min": d.repair_cost_min or 0,
                    "repair_max": d.repair_cost_max or 0,
                }
            )

    priorities.sort(key=lambda p: p["rut_score"], reverse=True)
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
    for i, p in enumerate(priorities):
        p["priority_rank"] = len(priorities) - i

    total_repair_min = sum(d.repair_cost_min or 0 for d in rows)
    total_repair_max = sum(d.repair_cost_max or 0 for d in rows)
    by_severity: dict[str, int] = {}
    for d in rows:
        key = d.severity or "low"
        by_severity[key] = by_severity.get(key, 0) + 1

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

    return {
        "org_name": org.name,
        "org_slug": org.slug,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "total_issues": len(rows),
        "total_potholes": len(rows),
        "total_inspections": len(image_keys),
        "by_severity": by_severity,
        "total_repair_min": total_repair_min,
        "total_repair_max": total_repair_max,
        "critical_count": sum(1 for d in rows if d.severity == "critical"),
        "growing_count": sum(1 for d in rows if d.evolution_stage == "growing"),
        "priorities": priorities[:80],
    }


def _report_table_rows(data: dict) -> str:
    rows = ""
    for p in data.get("priorities") or []:
        rows += f"""
      <tr>
        <td>{p['display_label']}</td>
        <td>{p['severity_label']}</td>
        <td>{p['rut_score']}</td>
        <td>{p['class_name']}</td>
        <td>{p['depth_cm'] or '-'} / {p['width_cm'] or '-'}</td>
        <td>{_fmt_money(p['repair_min'])} – {_fmt_money(p['repair_max'])}</td>
        <td>{_fmt_coord(p['latitude'], p['longitude'])}</td>
      </tr>"""
    if not rows:
        rows = '<tr><td colspan="7">لا توجد كشوفات حفر</td></tr>'
    return rows


def _report_styles() -> str:
    return """
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      background: #0a1020;
      color: #e2e8f0;
      margin: 0;
      padding: 28px 32px 36px;
      line-height: 1.55;
    }
    .report-header {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 18px;
      padding-bottom: 16px;
      border-bottom: 1px solid #334155;
    }
    .report-logo { height: 52px; width: auto; max-width: 220px; object-fit: contain; }
    .report-title { margin: 0; color: #22d3ee; font-size: 1.55rem; font-weight: 800; }
    .report-sub { margin: 4px 0 0; color: #94a3b8; font-size: 0.92rem; }
    .card {
      background: #121f35;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 18px 20px;
      margin: 14px 0;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 8px;
    }
    .metric {
      background: rgba(255,255,255,0.03);
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 12px 14px;
    }
    .metric-val { display: block; font-size: 1.55rem; font-weight: 800; color: #fbbf24; }
    .metric-lbl { display: block; font-size: 0.82rem; color: #94a3b8; margin-top: 2px; }
    .sev-list { margin: 10px 0 0; padding-inline-start: 20px; color: #cbd5e1; }
    .note { color: #64748b; font-size: 0.78rem; margin-top: 10px; }
    h2 { color: #22d3ee; font-size: 1.1rem; margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #334155; padding: 8px 10px; text-align: right; }
    th { background: #1e293b; color: #22d3ee; font-weight: 700; }
    tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
    .footer {
      margin-top: 22px;
      padding-top: 14px;
      border-top: 1px solid #334155;
      color: #64748b;
      font-size: 11px;
      text-align: center;
    }
    """


def _build_report_html(data: dict) -> str:
    logo = _logo_data_uri()
    logo_html = (
        f'<img class="report-logo" src="{logo}" alt="RUTRIX" />'
        if logo
        else '<strong style="color:#22d3ee;font-size:1.4rem">RUTRIX</strong>'
    )
    sev_rows = "".join(
        f"<li>{_severity_label(k)}: {v}</li>" for k, v in data.get("by_severity", {}).items()
    )

    return f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>RUTRIX Report — {data['org_name']}</title>
  <style>{_report_styles()}</style>
</head>
<body>
  <header class="report-header">
    {logo_html}
    <div>
      <h1 class="report-title">RUTRIX — تقرير صيانة الطرق</h1>
      <p class="report-sub">{data['org_name']} | {data['generated_at']}</p>
    </div>
  </header>

  <div class="card">
    <div class="metrics">
      <div class="metric">
        <span class="metric-val">{data.get('total_inspections', data['total_issues'])}</span>
        <span class="metric-lbl">إجمالي الكشوفات</span>
      </div>
      <div class="metric">
        <span class="metric-val">{data.get('total_potholes', data['total_issues'])}</span>
        <span class="metric-lbl">تم اكتشاف حفر</span>
      </div>
      <div class="metric">
        <span class="metric-val">{data['critical_count']}</span>
        <span class="metric-lbl">حالات حرجة</span>
      </div>
      <div class="metric">
        <span class="metric-val">{_fmt_money(data['total_repair_min'])} – {_fmt_money(data['total_repair_max'])}</span>
        <span class="metric-lbl">تكلفة ترقيع تقديرية (USD)</span>
      </div>
    </div>
    <p>قيد النمو: {data['growing_count']}</p>
    <ul class="sev-list">{sev_rows}</ul>
    <p class="note">* التكلفة = ترقيع محلي بالأسفل البارد + عمالة قصيرة — لكل حفرة على حدة.</p>
  </div>

  <div class="card">
    <h2>أولويات الصيانة</h2>
    <table>
      <thead><tr>
        <th>الصورة / الحفرة</th><th>الخطورة</th><th>RUT</th><th>النوع</th>
        <th>عمق/عرض سم</th><th>تكلفة</th><th>إحداثيات</th>
      </tr></thead>
      <tbody>{_report_table_rows(data)}</tbody>
    </table>
  </div>

  <p class="footer">RUTRIX — Road Infrastructure Intelligence &amp; Asset Management Platform</p>
</body>
</html>"""


def generate_html_report(data: dict) -> str:
    return _build_report_html(data)


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


def generate_pdf_report(data: dict) -> bytes:
    try:
        return _generate_pdf_from_html(data)
    except Exception as exc:
        logger.exception("HTML-style PDF failed, using table fallback: %s", exc)
        try:
            return _generate_pdf_report_inner(data)
        except Exception:
            logger.exception("Unicode PDF failed, using ASCII fallback")
            return _generate_pdf_report_ascii(data)


def _generate_pdf_from_html(data: dict) -> bytes:
    from fpdf import FPDF

    html = _build_report_html(data)
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_margins(12, 12, 12)
    pdf.add_page()
    family = _setup_pdf_font(pdf)
    pdf.set_font(family, size=10)
    pdf.write_html(html)
    content = _pdf_bytes(pdf)
    if content[:4] != b"%PDF":
        raise ValueError("PDF generation produced invalid output")
    return content


def _pdf_ar_line(pdf, family: str, size: int, text: str, *, bold: bool = False, ln: bool = False):
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


def _generate_pdf_report_inner(data: dict) -> bytes:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    family = _setup_pdf_font(pdf)

    logo = _logo_path()
    if logo:
        pdf.image(str(logo), x=pdf.l_margin, y=pdf.get_y(), w=42)
        pdf.ln(18)

    _pdf_ar_line(pdf, family, 16, "RUTRIX — تقرير صيانة الطرق", bold=True, ln=True)
    _pdf_ar_line(pdf, family, 11, f"الجهة: {data['org_name']}", ln=True)
    _pdf_ar_line(pdf, family, 11, f"تاريخ التوليد: {data['generated_at']}", ln=True)
    pdf.ln(3)

    _pdf_ar_line(
        pdf,
        family,
        11,
        f"إجمالي الكشوفات: {data.get('total_inspections', data['total_issues'])} | "
        f"حفر: {data.get('total_potholes', data['total_issues'])} | "
        f"حرجة: {data['critical_count']}",
        ln=True,
    )
    _pdf_ar_line(
        pdf,
        family,
        11,
        f"تكلفة ترقيع تقديرية: {_fmt_money(data['total_repair_min'])} — {_fmt_money(data['total_repair_max'])}",
        ln=True,
    )
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

    logo = _logo_path()
    if logo:
        pdf.image(str(logo), x=10, y=10, w=42)
        pdf.ln(18)

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "RUTRIX Road Maintenance Report", ln=True)
    pdf.set_font("Helvetica", size=11)
    pdf.cell(0, 8, f"Org: {_ascii_safe(data.get('org_name', ''))}", ln=True)
    pdf.cell(0, 8, f"Generated: {data['generated_at']}", ln=True)
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
    for p in data.get("priorities", [])[:80]:
        line = _ascii_safe(
            " | ".join(
                [
                    str(p.get("display_label", p["id"])),
                    str(p.get("severity_label", "")),
                    str(p["rut_score"]),
                    f"{_fmt_money(p['repair_min'])} - {_fmt_money(p['repair_max'])}",
                ]
            )
        )
        pdf.multi_cell(pdf.epw, 5, line)
    content = _pdf_bytes(pdf)
    if content[:4] != b"%PDF":
        raise ValueError("ASCII PDF fallback failed")
    return content
