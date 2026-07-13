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

# Brand palette (print-friendly municipal report)
_NAVY = (11, 18, 32)
_NAVY_MID = (18, 31, 53)
_CYAN = (8, 145, 178)
_CYAN_SOFT = (34, 211, 238)
_SLATE = (51, 65, 85)
_MUTED = (100, 116, 139)
_LINE = (226, 232, 240)
_CARD_BG = (248, 250, 252)
_WHITE = (255, 255, 255)
_INK = (15, 23, 42)
_AMBER = (180, 83, 9)

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


def _logo_path(*, variant: str = "report") -> Path | None:
    if variant == "header":
        candidates = (
            _STATIC / "logo-header.png",
            _STATIC / "logo.png",
            _STATIC / "logo-report.png",
        )
    elif variant == "light":
        candidates = (_STATIC / "logo-light.png", _STATIC / "logo-report.png")
    else:
        candidates = (
            _STATIC / "logo-header.png",
            _STATIC / "logo-report.png",
            _STATIC / "logo.png",
        )
    for path in candidates:
        if path.is_file():
            return path
    return None


def _logo_data_uri() -> str:
    # Transparent white wordmark: blends into the coloured report header.
    path = _STATIC / "logo-report.png"
    if not path.is_file():
        path = _logo_path(variant="report")
    if not path:
        return ""
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


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
        <td><span class="severity severity-{p['severity']}">{p['severity_label']}</span></td>
        <td>{p['rut_score']}</td>
        <td>{p['class_name']}</td>
        <td>{p['depth_cm'] or '-'} / {p['width_cm'] or '-'}</td>
        <td>{_fmt_money(p['repair_min'])} – {_fmt_money(p['repair_max'])}</td>
        <td>{_fmt_coord(p['latitude'], p['longitude'])}</td>
      </tr>"""
    if not rows:
        rows = '<tr><td colspan="7" style="text-align:center;color:#64748b">لا توجد كشوفات حفر</td></tr>'
    return rows


def _report_styles() -> str:
    return """
    @page {
      size: A4;
      margin: 10mm;
      background: #eef4f8;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'DejaVu Sans', 'Segoe UI', Tahoma, Arial, sans-serif;
      background: #eef4f8;
      color: #0f172a;
      margin: 0;
      padding: 0;
      line-height: 1.55;
    }
    .sheet {
      width: 100%;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #d9e5ec;
      border-radius: 14px;
      box-shadow: 0 8px 28px rgba(15, 23, 42, 0.12);
      overflow: hidden;
    }
    .report-header {
      background: linear-gradient(125deg, #071a2c 0%, #0b3b4f 58%, #087f8c 100%);
      color: #e2e8f0;
      padding: 22px 26px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      position: relative;
    }
    .report-header::after {
      content: "";
      position: absolute;
      left: 44%;
      bottom: -44px;
      width: 150px;
      height: 150px;
      border: 24px solid rgba(34, 211, 238, 0.09);
      border-radius: 50%;
    }
    .report-logo {
      height: 46px;
      width: auto;
      max-width: 185px;
      object-fit: contain;
      display: block;
      position: relative;
      z-index: 1;
    }
    .header-meta { text-align: right; position: relative; z-index: 1; }
    .report-title {
      margin: 0;
      color: #fff;
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: 0.01em;
    }
    .report-sub { margin: 6px 0 0; color: #bae6fd; font-size: 0.82rem; }
    .accent { height: 5px; background: linear-gradient(90deg, #06b6d4, #34d399, #fbbf24); }
    .body { padding: 20px 24px 22px; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    @media (max-width: 720px) {
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .report-header { flex-direction: column; align-items: flex-start; }
      .header-meta { text-align: right; }
    }
    .metric {
      background: linear-gradient(145deg, #ffffff, #f1f7fa);
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 12px 12px 11px;
      border-top: 4px solid #06b6d4;
      box-shadow: 0 3px 10px rgba(15, 23, 42, 0.06);
    }
    .metric:nth-child(2) { border-top-color: #10b981; }
    .metric:nth-child(3) { border-top-color: #f59e0b; }
    .metric:nth-child(4) { border-top-color: #8b5cf6; }
    .metric-val {
      display: block;
      font-size: 1.28rem;
      font-weight: 800;
      color: #0f172a;
      direction: ltr;
    }
    .metric-lbl {
      display: block;
      font-size: 0.78rem;
      color: #64748b;
      margin-top: 4px;
    }
    .card {
      background: linear-gradient(180deg, #ffffff, #fbfdff);
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 14px 16px;
      margin: 0 0 14px;
      box-shadow: 0 3px 12px rgba(15, 23, 42, 0.05);
      break-inside: avoid;
    }
    h2 {
      color: #0f172a;
      font-size: 1rem;
      margin: 0 0 10px;
      padding: 0 11px 7px 0;
      border-right: 4px solid #06b6d4;
      border-bottom: 1px solid #e2e8f0;
    }
    .sev-list {
      margin: 8px 0 0;
      padding: 0;
      color: #334155;
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .sev-list li {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 0.8rem;
    }
    .note { color: #64748b; font-size: 0.78rem; margin: 10px 0 0; }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 9px;
      overflow: hidden;
      border-radius: 9px;
      border: 1px solid #dbe5ec;
    }
    th, td {
      border-bottom: 1px solid #e2e8f0;
      padding: 7px 6px;
      text-align: right;
    }
    th {
      background: linear-gradient(135deg, #0b3b4f, #087f8c);
      color: #fff;
      font-weight: 700;
    }
    tbody tr:nth-child(even) td { background: #f4f9fb; }
    tbody tr:last-child td { border-bottom: 0; }
    .severity {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      font-weight: 700;
      white-space: nowrap;
    }
    .severity-low { color: #047857; background: #d1fae5; }
    .severity-medium { color: #a16207; background: #fef3c7; }
    .severity-high { color: #c2410c; background: #ffedd5; }
    .severity-critical { color: #b91c1c; background: #fee2e2; }
    .footer {
      margin-top: 8px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      color: #64748b;
      font-size: 9px;
      text-align: center;
    }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    @media print {
      body { background: #eef4f8; }
      .sheet { box-shadow: none; }
    }
    """


def _build_report_html(data: dict) -> str:
    logo = _logo_data_uri()
    logo_html = (
        f'<img class="report-logo" src="{logo}" alt="RUTRIX" />'
        if logo
        else '<strong style="color:#22d3ee;font-size:1.5rem;letter-spacing:0.04em">RUTRIX</strong>'
    )
    sev_rows = "".join(
        f"<li>{_severity_label(k)}: {v}</li>" for k, v in data.get("by_severity", {}).items()
    ) or "<li>لا توجد بيانات خطورة</li>"

    return f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>RUTRIX Report — {data['org_name']}</title>
  <style>{_report_styles()}</style>
</head>
<body>
  <div class="sheet">
    <header class="report-header">
      {logo_html}
      <div class="header-meta">
        <h1 class="report-title">تقرير صيانة الطرق</h1>
        <p class="report-sub">{data['org_name']} · {data['generated_at']}</p>
      </div>
    </header>
    <div class="accent"></div>
    <div class="body">
      <div class="metrics">
        <div class="metric">
          <span class="metric-val">{data.get('total_inspections', data['total_issues'])}</span>
          <span class="metric-lbl">إجمالي الكشوفات</span>
        </div>
        <div class="metric">
          <span class="metric-val">{data.get('total_potholes', data['total_issues'])}</span>
          <span class="metric-lbl">حفر مكتشفة</span>
        </div>
        <div class="metric">
          <span class="metric-val">{data['critical_count']}</span>
          <span class="metric-lbl">حالات حرجة</span>
        </div>
        <div class="metric">
          <span class="metric-val">{_fmt_money(data['total_repair_min'])} – {_fmt_money(data['total_repair_max'])}</span>
          <span class="metric-lbl">تكلفة ترقيع تقديرية</span>
        </div>
      </div>

      <div class="card">
        <h2>ملخص الخطورة</h2>
        <p style="margin:0;color:#334155">قيد النمو: {data['growing_count']}</p>
        <ul class="sev-list">{sev_rows}</ul>
        <p class="note">* التكلفة = ترقيع محلي (cold patch) + عمالة قصيرة — تقدير لكل حفرة.</p>
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
    </div>
  </div>
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
        logger.exception("HTML PDF failed, using native PDF fallback: %s", exc)
        try:
            return _generate_pdf_professional(data)
        except Exception:
            logger.exception("Native PDF failed, using ASCII fallback")
            return _generate_pdf_report_ascii(data)


def _generate_pdf_from_html(data: dict) -> bytes:
    """Render the exact HTML report design to PDF using WeasyPrint."""
    from weasyprint import HTML

    content = HTML(
        string=_build_report_html(data),
        base_url=str(_STATIC),
    ).write_pdf()
    if content[:4] != b"%PDF":
        raise ValueError("HTML renderer produced invalid PDF output")
    return content


def _pdf_text(pdf, family: str, size: int, text: str, *, align: str = "R", bold: bool = False):
    if family == "Helvetica":
        pdf.set_font(family, "B" if bold else "", size)
        pdf.multi_cell(pdf.epw, 6, _ascii_safe(text), align="L" if align == "R" else align)
    else:
        pdf.set_font(family, size=size + (1 if bold else 0))
        pdf.multi_cell(pdf.epw, 6, _ar(text), align=align)


def _draw_header(pdf, family: str, data: dict) -> None:
    page_w = pdf.w
    header_h = 34
    pdf.set_fill_color(*_NAVY)
    pdf.rect(0, 0, page_w, header_h, "F")
    pdf.set_fill_color(*_CYAN)
    pdf.rect(0, header_h, page_w, 1.6, "F")

    logo = _STATIC / "logo-report.png"
    if not logo.is_file():
        logo = _logo_path(variant="report")
    logo_drawn = False
    if logo:
        try:
            # Transparent wordmark blends into the coloured header.
            pdf.image(str(logo), x=10, y=7, h=20)
            logo_drawn = True
        except Exception as exc:
            logger.warning("Could not place report logo: %s", exc)

    if not logo_drawn:
        pdf.set_xy(12, 10)
        pdf.set_text_color(*_CYAN_SOFT)
        pdf.set_font("Helvetica", "B", 18)
        pdf.cell(40, 10, "RUTRIX")

    # Title block on the right (RTL visual balance)
    pdf.set_xy(page_w - 105, 8)
    pdf.set_text_color(*_WHITE)
    if family == "Helvetica":
        pdf.set_font(family, "B", 13)
        pdf.cell(93, 7, "Road Maintenance Report", align="R")
        pdf.set_xy(page_w - 105, 16)
        pdf.set_font(family, "", 9)
        pdf.set_text_color(148, 163, 184)
        pdf.cell(93, 5, _ascii_safe(f"{data['org_name']}  |  {data['generated_at']}"), align="R")
    else:
        pdf.set_font(family, size=13)
        pdf.cell(93, 7, _ar("تقرير صيانة الطرق"), align="R")
        pdf.set_xy(page_w - 105, 16)
        pdf.set_font(family, size=9)
        pdf.set_text_color(148, 163, 184)
        pdf.cell(93, 5, _ar(f"{data['org_name']}  |  {data['generated_at']}"), align="R")

    pdf.set_y(header_h + 8)
    pdf.set_text_color(*_INK)


def _draw_metric_card(pdf, x: float, y: float, w: float, h: float, value: str, label: str, family: str):
    pdf.set_fill_color(*_CARD_BG)
    pdf.set_draw_color(*_LINE)
    pdf.rect(x, y, w, h, "DF")
    pdf.set_fill_color(*_CYAN)
    pdf.rect(x, y, w, 1.4, "F")

    pdf.set_xy(x + 2, y + 4)
    pdf.set_text_color(*_INK)
    if family == "Helvetica":
        pdf.set_font(family, "B", 12)
        pdf.cell(w - 4, 7, _ascii_safe(value), align="C")
        pdf.set_xy(x + 2, y + 12)
        pdf.set_font(family, "", 8)
        pdf.set_text_color(*_MUTED)
        pdf.cell(w - 4, 5, _ascii_safe(label), align="C")
    else:
        pdf.set_font(family, size=12)
        pdf.cell(w - 4, 7, _ar(value), align="C")
        pdf.set_xy(x + 2, y + 12)
        pdf.set_font(family, size=8)
        pdf.set_text_color(*_MUTED)
        pdf.cell(w - 4, 5, _ar(label), align="C")


def _draw_metrics_row(pdf, family: str, data: dict) -> None:
    y = pdf.get_y()
    gap = 3.5
    card_w = (pdf.epw - 3 * gap) / 4
    card_h = 22
    x0 = pdf.l_margin
    cards = [
        (str(data.get("total_inspections", data["total_issues"])), "إجمالي الكشوفات"),
        (str(data.get("total_potholes", data["total_issues"])), "حفر مكتشفة"),
        (str(data["critical_count"]), "حالات حرجة"),
        (
            f"{_fmt_money(data['total_repair_min'])} – {_fmt_money(data['total_repair_max'])}",
            "تكلفة ترقيع تقديرية",
        ),
    ]
    for i, (val, lbl) in enumerate(cards):
        _draw_metric_card(pdf, x0 + i * (card_w + gap), y, card_w, card_h, val, lbl, family)
    pdf.set_y(y + card_h + 8)
    pdf.set_text_color(*_INK)


def _draw_section_title(pdf, family: str, title: str) -> None:
    y = pdf.get_y()
    pdf.set_text_color(*_INK)
    if family == "Helvetica":
        pdf.set_font(family, "B", 12)
        pdf.cell(pdf.epw, 7, _ascii_safe(title), align="L")
    else:
        pdf.set_font(family, size=12)
        pdf.cell(pdf.epw, 7, _ar(title), align="R")
    pdf.ln(8)
    pdf.set_draw_color(*_CYAN)
    pdf.set_line_width(0.5)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + 42, pdf.get_y())
    pdf.ln(4)
    pdf.set_line_width(0.2)


def _render_pdf_table(pdf, family: str, data: dict) -> None:
    from fpdf.fonts import FontFace

    priorities = data.get("priorities") or []
    if not priorities:
        pdf.set_fill_color(*_CARD_BG)
        pdf.set_draw_color(*_LINE)
        pdf.rect(pdf.l_margin, pdf.get_y(), pdf.epw, 16, "DF")
        pdf.set_xy(pdf.l_margin, pdf.get_y() + 5)
        pdf.set_text_color(*_MUTED)
        _pdf_text(pdf, family, 10, "لا توجد كشوفات حفر في المنصة حالياً.", align="C")
        return

    headings = FontFace(family=family, size_pt=8, color=_WHITE, fill_color=_NAVY)
    pdf.set_font(family, size=7)
    pdf.set_text_color(*_INK)

    with pdf.table(
        width=pdf.epw,
        col_widths=(2.2, 1.1, 0.7, 0.9, 1.2, 1.4, 1.6),
        text_align="CENTER",
        first_row_as_headings=True,
        headings_style=headings,
        line_height=5.2,
        borders_layout="ALL",
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
            header.cell(_ar(col) if family != "Helvetica" else _ascii_safe(col))

        for p in priorities[:80]:
            row = table.row()
            cells = [
                p["display_label"],
                p["severity_label"],
                str(p["rut_score"]),
                p["class_name"],
                f"{p['depth_cm'] or '-'} / {p['width_cm'] or '-'}",
                f"{_fmt_money(p['repair_min'])} - {_fmt_money(p['repair_max'])}",
                _fmt_coord(p["latitude"], p["longitude"]),
            ]
            for i, c in enumerate(cells):
                if family == "Helvetica":
                    row.cell(_ascii_safe(c))
                elif i in (2, 3, 4, 5):
                    row.cell(c)
                else:
                    row.cell(_ar(c))


def _generate_pdf_professional(data: dict) -> bytes:
    from fpdf import FPDF

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(12, 12, 12)
    pdf.add_page()
    family = _setup_pdf_font(pdf)

    _draw_header(pdf, family, data)
    _draw_metrics_row(pdf, family, data)

    _draw_section_title(pdf, family, "ملخص الخطورة")
    sev_bits = [f"{_severity_label(k)}: {v}" for k, v in (data.get("by_severity") or {}).items()]
    summary = f"قيد النمو: {data['growing_count']}"
    if sev_bits:
        summary += "  |  " + "  ·  ".join(sev_bits)
    pdf.set_text_color(*_SLATE)
    _pdf_text(pdf, family, 9, summary, align="R")
    pdf.ln(1)
    pdf.set_text_color(*_MUTED)
    _pdf_text(
        pdf,
        family,
        8,
        "* التكلفة = ترقيع محلي (cold patch) + عمالة قصيرة — تقدير لكل حفرة.",
        align="R",
    )
    pdf.ln(4)

    _draw_section_title(pdf, family, "أولويات الصيانة")
    _render_pdf_table(pdf, family, data)

    # Footer (only if room on current page)
    if pdf.get_y() < pdf.h - 22:
        pdf.set_y(-14)
    else:
        pdf.ln(4)
    pdf.set_draw_color(*_LINE)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(2)
    pdf.set_text_color(*_MUTED)
    pdf.set_font("Helvetica", size=8)
    pdf.cell(
        0,
        5,
        "RUTRIX - Road Infrastructure Intelligence & Asset Management Platform",
        align="C",
    )

    content = _pdf_bytes(pdf)
    if content[:4] != b"%PDF":
        raise ValueError("PDF generation produced invalid output")
    return content


def _generate_pdf_report_ascii(data: dict) -> bytes:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_fill_color(*_NAVY)
    pdf.rect(0, 0, pdf.w, 28, "F")
    pdf.set_fill_color(*_CYAN)
    pdf.rect(0, 28, pdf.w, 1.5, "F")

    logo = _logo_path(variant="header")
    if logo:
        try:
            pdf.image(str(logo), x=10, y=6, h=16)
        except Exception:
            pass

    pdf.set_xy(10, 32)
    pdf.set_text_color(*_INK)
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, "RUTRIX Road Maintenance Report", ln=True)
    pdf.set_font("Helvetica", size=10)
    pdf.cell(0, 6, f"Org: {_ascii_safe(data.get('org_name', ''))}", ln=True)
    pdf.cell(0, 6, f"Generated: {data['generated_at']}", ln=True)
    pdf.cell(
        0,
        6,
        f"Repair estimate: {_fmt_money(data['total_repair_min'])} - {_fmt_money(data['total_repair_max'])}",
        ln=True,
    )
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Maintenance priorities", ln=True)
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
