import { useLocale } from "../context/LocaleContext";

const STEPS = ["detected", "verified"];

export default function DetectionStatusPipeline({ detection }) {
  const { t } = useLocale();
  if (!detection || detection.class_name === "photo") return null;

  const status = detection.detection_status || "detected";
  const rejected = status === "rejected";
  const currentIdx = rejected ? -1 : STEPS.indexOf(status === "verified" ? "verified" : "detected");

  const labels = {
    detected: t.statusDetected,
    verified: t.statusVerified,
    rejected: t.statusRejected,
  };

  return (
    <div className={`detection-workflow${rejected ? " detection-workflow--rejected" : ""}`}>
      <p className="detection-workflow-title">{t.workflowTitle}</p>
      {rejected ? (
        <span className="detection-workflow-badge rejected">{labels.rejected}</span>
      ) : (
        <div className="detection-workflow-steps">
          {STEPS.map((step, idx) => {
            const done = idx <= currentIdx;
            const active = idx === currentIdx;
            return (
              <div
                key={step}
                className={`detection-workflow-step${done ? " done" : ""}${active ? " active" : ""}`}
              >
                <span className="detection-workflow-dot">{done ? "✓" : idx + 1}</span>
                <span className="detection-workflow-label">{labels[step]}</span>
              </div>
            );
          })}
        </div>
      )}
      {detection.confirmation_count > 1 && !rejected && (
        <p className="detection-workflow-note">
          {t.confirmationsCount.replace("{n}", String(detection.confirmation_count))}
        </p>
      )}
    </div>
  );
}
