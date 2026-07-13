import { useMemo } from "react";
import { useLocale } from "../context/LocaleContext";
import { deviceLabel } from "../i18n/translations";
import { countClusterReports } from "../hooks/useCriticalAlerts";
import NavIcon from "./NavIcons";

function groupDetectionsForList(detections) {
  const groups = new Map();

  for (const d of detections) {
    const key = d.image_url || `solo-${d.id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(d);
  }

  return Array.from(groups.values()).map((items) => {
    const potholes = items.filter((x) => x.class_name !== "photo");
    const primary =
      potholes.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0] ||
      items[0];
    return {
      primary,
      count: items.length,
      potholeCount: potholes.length,
    };
  });
}

export default function DetectionList({
  detections,
  selectedId,
  onSelect,
  compact = false,
  hideHeader = false,
}) {
  const { t } = useLocale();
  const grouped = useMemo(() => groupDetectionsForList(detections), [detections]);
  const clusterCounts = useMemo(() => {
    const counts = {};
    for (const d of detections) {
      if (d.cluster_id && d.class_name !== "photo") {
        counts[d.cluster_id] = (counts[d.cluster_id] || 0) + 1;
      }
    }
    return counts;
  }, [detections]);

  return (
    <section className={`detection-section ${compact ? "compact" : ""}`}>
      {!hideHeader && !compact && (
        <div className="section-label">
          <span className="section-label-icon"><NavIcon name="recent" /></span>
          <span>
            {t.recent} ({grouped.length})
          </span>
        </div>
      )}
      <ul className="detection-list">
        {grouped.map(({ primary: d, count, potholeCount }) => (
          <li
            key={d.image_url ? `img-${d.image_url}` : d.id}
            className={`detection-item ${selectedId === d.id ? "active" : ""}`}
            onClick={() => onSelect(d.id)}
          >
            {d.image_url ? (
              <img src={d.image_url} alt="" className="detection-thumb" loading="lazy" />
            ) : (
              <div className="detection-thumb placeholder">
                <NavIcon name={d.class_name === "photo" ? "field" : "pothole"} />
              </div>
            )}
            <div className="detection-body">
              <div className="detection-top">
                <span className={`badge badge-${d.device_type}`}>
                  {deviceLabel(t, d.device_type)}
                </span>
                <span
                  className={`badge badge-${d.class_name === "photo" ? "photo" : d.detection_status}`}
                >
                  {d.class_name === "photo"
                    ? t.photo
                    : d.detection_status === "verified"
                      ? t.verified
                      : t.detected}
                </span>
                {potholeCount > 0 && (
                  <span className="badge badge-count">
                    {t.potholesDetected.replace("{n}", String(potholeCount))}
                  </span>
                )}
                {d.cluster_id && (clusterCounts[d.cluster_id] ?? 0) > 1 && (
                  <span className="badge badge-cluster">
                    {t.clusterReports.replace("{n}", String(clusterCounts[d.cluster_id]))}
                  </span>
                )}
              </div>
              <div>
                {d.class_name === "photo" ? (
                  t.onMap
                ) : (
                  <>
                    {t.confidence}:{" "}
                    <span className="conf">{(d.confidence * 100).toFixed(0)}%</span>
                    {count > 1 && potholeCount <= 1 && (
                      <span className="meta-inline"> · {count} {t.records}</span>
                    )}
                  </>
                )}
              </div>
              <div className="meta">
                {d.reporter_name ? (
                  <span className="meta-reporter">
                    {t.uploadedBy}: {d.reporter_name}
                  </span>
                ) : null}
                {d.latitude != null
                  ? `${d.latitude?.toFixed(5)}, ${d.longitude?.toFixed(5)}`
                  : t.noGps}
              </div>
            </div>
          </li>
        ))}
        {grouped.length === 0 && (
          <li className="detection-item empty">
            <div className="detection-body empty-state">{t.noDetections}</div>
          </li>
        )}
      </ul>
    </section>
  );
}
