import { useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { openPageHtml, openPagePdf, printCurrentPage } from "../utils/exportPage";

/**
 * Export actions for the visible dashboard page (map, field, overview, etc.).
 * @param {'default' | 'compact' | 'toolbar'} variant
 * @param {{ detections?: array, includePointsTable?: boolean }} exportContext
 */
export default function PageExportToolbar({
  variant = "toolbar",
  className = "",
  exportContext = null,
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(null);
  const compact = variant === "compact";
  const toolbar = variant === "toolbar";

  const context = useMemo(() => {
    if (!exportContext?.detections?.length) return null;
    return {
      detections: exportContext.detections,
      labels: {
        pointsTitle: t.pageExportPointsTitle,
        id: "#",
        coords: t.pageExportCoords,
        severity: t.severity,
        rut: t.rutShort,
        type: t.pageExportType,
        status: t.pageExportStatus,
        reporter: t.uploadedBy,
      },
    };
  }, [exportContext, t]);

  const run = async (kind, fn) => {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      const msg =
        err?.message === "popup_blocked"
          ? t.reportPopupBlocked
          : err?.message ||
            (kind === "pdf"
              ? t.pageExportPdfFail
              : kind === "print"
                ? t.pageExportPrintFail
                : t.pageExportHtmlFail);
      window.alert(msg);
    } finally {
      setBusy(null);
    }
  };

  const buttons = (
    <div className={`page-export-btns report-btns${toolbar ? " report-btns--toolbar" : ""}`}>
      <button
        type="button"
        className="report-btn"
        disabled={!!busy}
        onClick={() => run("html", () => Promise.resolve(openPageHtml(context)))}
      >
        {busy === "html" ? t.loading : `📄 ${t.pageExportHtml}`}
      </button>
      <button
        type="button"
        className="report-btn"
        disabled={!!busy}
        onClick={() => run("print", () => Promise.resolve(printCurrentPage(context)))}
      >
        {busy === "print" ? t.loading : `🖨️ ${t.pageExportPrint}`}
      </button>
      <button
        type="button"
        className="report-btn primary"
        disabled={!!busy}
        onClick={() => run("pdf", () => Promise.resolve(openPagePdf(context)))}
      >
        {busy === "pdf" ? t.loading : `📥 ${t.pageExportPdf}`}
      </button>
    </div>
  );

  if (toolbar) {
    return (
      <div
        className={`page-export-toolbar ${className}`.trim()}
        role="group"
        aria-label={t.pageExportTitle}
      >
        {buttons}
      </div>
    );
  }

  return (
    <section
      className={`page-export-panel section-card${compact ? " page-export-panel--compact" : ""} ${className}`.trim()}
    >
      <div className="page-export-head">
        <h3 className="page-export-title">{t.pageExportTitle}</h3>
        {!compact ? <p className="page-export-sub">{t.pageExportSub}</p> : null}
      </div>
      {compact ? <p className="page-export-sub page-export-sub--tight">{t.pageExportSub}</p> : null}
      {buttons}
    </section>
  );
}
