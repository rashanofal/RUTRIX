import { useLocale } from "../context/LocaleContext";
import { pipelineStepIndex, UNIFIED_FLOW_STEPS } from "../utils/workOrderFlow";

export default function DetectionStatusPipeline({ detection, workOrder = null }) {
  const { t } = useLocale();
  if (!detection || detection.class_name === "photo") return null;

  const rejected = detection.detection_status === "rejected";
  const currentIdx = pipelineStepIndex(detection, workOrder);

  const labels = {
    detected: t.statusDetected,
    verified: t.statusVerified,
    wo_open: t.flowWoOpen,
    wo_field: t.flowWoField,
    wo_review: t.flowWoReview,
    wo_closed: t.flowWoClosed,
    rejected: t.statusRejected,
  };

  return (
    <div className={`detection-workflow${rejected ? " detection-workflow--rejected" : ""}`}>
      <p className="detection-workflow-title">{t.unifiedWorkflowTitle}</p>
      {rejected ? (
        <span className="detection-workflow-badge rejected">{labels.rejected}</span>
      ) : (
        <div className="detection-workflow-steps detection-workflow-steps--unified">
          {UNIFIED_FLOW_STEPS.map((step, idx) => {
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
      {workOrder && !rejected && (
        <p className="detection-workflow-note">
          {t.flowWoLinked.replace("{title}", workOrder.title || `#${workOrder.id}`)}
        </p>
      )}
      {detection.confirmation_count > 1 && !rejected && (
        <p className="detection-workflow-note">
          {t.confirmationsCount.replace("{n}", String(detection.confirmation_count))}
        </p>
      )}
    </div>
  );
}
