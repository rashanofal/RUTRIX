import { useLocale } from "../context/LocaleContext";
import IntelligencePanel from "../components/IntelligencePanel";

export default function IntelligencePage({ stats, refreshKey = 0, detections = [] }) {
  const { t } = useLocale();

  if (!stats) {
    return (
      <div className="page-intel page-empty">
        <p>{t.loading}</p>
      </div>
    );
  }

  return (
    <div className="page-intel">
      <IntelligencePanel stats={stats} refreshKey={refreshKey} detections={detections} />
    </div>
  );
}
