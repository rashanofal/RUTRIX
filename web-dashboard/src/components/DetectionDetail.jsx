import { useLocale } from "../context/LocaleContext";
import DetectionStatusPipeline from "./DetectionStatusPipeline";

export default function DetectionDetail({
  selected,
  detections = [],
  deletingId,
  onDelete,
  onConfirm,
  onVerify,
  onReject,
}) {
  const { t } = useLocale();
  if (!selected) return null;

  const siblings = selected.image_url
    ? detections.filter((d) => d.image_url === selected.image_url)
    : [selected];
  const potholeSiblings = siblings.filter((d) => d.class_name !== "photo");

  return (
    <div className="detail-panel section-card">
      {selected.image_url && (
        <img src={selected.image_url} alt="" className="detail-image" />
      )}
      {potholeSiblings.length > 1 && (
        <p className="detail-group-note">
          {t.multiplePotholes.replace("{n}", String(potholeSiblings.length))}
        </p>
      )}
      <p className="detail-meta">
        {selected.class_name === "photo" ? t.photo : t.pothole} #{selected.id}
        {selected.class_name !== "photo" && (
          <>
            {" "}
            — RUT {selected.rut_score ?? 0} · {t.severity}: {selected.severity}
            {" "}
            — {t.confidence}: {(selected.confidence * 100).toFixed(0)}%
          </>
        )}
      </p>
      <DetectionStatusPipeline detection={selected} />
      <button
        type="button"
        className="delete-one-btn"
        disabled={deletingId === selected.id}
        onClick={() => onDelete(selected.id)}
      >
        {deletingId === selected.id ? t.deleting : `🗑️ ${t.delete}`}
      </button>
      {selected.class_name !== "photo" && (
        <div className="detail-actions">
          <button type="button" className="confirm-btn" onClick={() => onConfirm(selected.id)}>
            ✓ {t.confirmReport}
          </button>
          <button type="button" className="verify-btn" onClick={() => onVerify(selected.id)}>
            ✅ {t.markVerified}
          </button>
          <button type="button" className="reject-btn" onClick={() => onReject(selected.id)}>
            ✕ {t.reject}
          </button>
        </div>
      )}
    </div>
  );
}
