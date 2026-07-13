import { useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { openReportHtml, openReportPdf, printReport } from "../hooks/useApi";

/**
 * Municipal report actions — reusable across Overview, Ops, Intel, Supervisor, Field, Map.
 * @param {'default' | 'compact' | 'toolbar'} variant
 */
export default function ReportExportPanel({ variant = "default", className = "" }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(null);
  const compact = variant === "compact";
  const toolbar = variant === "toolbar";

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
              ? t.reportPdfFail
              : kind === "print"
                ? t.reportPrintFail
                : t.reportHtmlFail);
      window.alert(msg);
    } finally {
      setBusy(null);
    }
  };

  const buttons = (
    <div className={`report-btns${toolbar ? " report-btns--toolbar" : ""}`}>
      <button
        type="button"
        className="report-btn"
        disabled={!!busy}
        onClick={() => run("html", () => openReportHtml())}
      >
        {busy === "html" ? t.loading : `📄 ${t.reportHtml}`}
      </button>
      <button
        type="button"
        className="report-btn"
        disabled={!!busy}
        onClick={() => run("print", () => printReport())}
      >
        {busy === "print" ? t.loading : `🖨️ ${t.reportPrint}`}
      </button>
      <button
        type="button"
        className="report-btn primary"
        disabled={!!busy}
        onClick={() => run("pdf", () => openReportPdf())}
      >
        {busy === "pdf" ? t.loading : `📥 ${t.reportPdf}`}
      </button>
    </div>
  );

  if (toolbar) {
    return (
      <div className={`report-export-toolbar ${className}`.trim()} role="group" aria-label={t.reportSectionTitle}>
        {buttons}
      </div>
    );
  }

  return (
    <section
      className={`report-export-panel section-card${compact ? " report-export-panel--compact" : ""} ${className}`.trim()}
    >
      <div className="report-export-head">
        <div>
          <h3 className="report-export-title">{t.reportSectionTitle}</h3>
          {!compact ? <p className="report-export-sub">{t.reportSectionSub}</p> : null}
        </div>
      </div>
      {compact ? <p className="report-export-sub report-export-sub--tight">{t.reportSectionSub}</p> : null}
      {buttons}
    </section>
  );
}
