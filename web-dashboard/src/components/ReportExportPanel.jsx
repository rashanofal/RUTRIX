import { useLocale } from "../context/LocaleContext";
import { openReportHtml, openReportPdf } from "../hooks/useApi";

export default function ReportExportPanel({ compact = false }) {
  const { t } = useLocale();

  return (
    <section className={`report-export-panel section-card${compact ? " report-export-panel--compact" : ""}`}>
      <h3 className="report-export-title">{t.reportSectionTitle}</h3>
      <p className="report-export-sub">{t.reportSectionSub}</p>
      <div className="report-btns">
        <button
          type="button"
          className="report-btn"
          onClick={async () => {
            try {
              await openReportHtml();
            } catch (err) {
              window.alert(err?.message || t.reportHtmlFail);
            }
          }}
        >
          📄 {t.reportHtml}
        </button>
        <button
          type="button"
          className="report-btn primary"
          onClick={async () => {
            try {
              await openReportPdf();
            } catch (err) {
              window.alert(err?.message || t.reportPdfFail);
            }
          }}
        >
          📥 {t.reportPdf}
        </button>
      </div>
    </section>
  );
}
