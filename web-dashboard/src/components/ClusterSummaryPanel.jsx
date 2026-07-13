import { useEffect, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { fetchRoadQuality } from "../hooks/useApi";
import NavIcon from "./NavIcons";
import { severityLabel } from "../i18n/translations";

export default function ClusterSummaryPanel({ refreshKey = 0, onSelectCluster }) {
  const { t } = useLocale();
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchRoadQuality();
        const potholeClusters = (data || [])
          .filter((c) => !c.is_survey && (c.pothole_count ?? c.detection_count ?? 0) > 0)
          .sort((a, b) => (b.rut_score ?? 0) - (a.rut_score ?? 0))
          .slice(0, 12);
        setClusters(potholeClusters);
      } catch {
        setClusters([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshKey]);

  return (
    <section className="cluster-summary section-card">
      <div className="section-label">
        <span className="section-label-icon"><NavIcon name="quality" /></span>
        <span>{t.clusterPanelTitle}</span>
      </div>
      <p className="cluster-summary-sub">{t.clusterPanelSub}</p>

      {loading ? (
        <p className="intel-empty">{t.loading}</p>
      ) : clusters.length === 0 ? (
        <p className="intel-empty">{t.clusterPanelEmpty}</p>
      ) : (
        <ul className="cluster-list">
          {clusters.map((c) => (
            <li key={c.cluster_id} className={`cluster-item sev-${c.severity || "low"}`}>
              <div className="cluster-top">
                <span className="cluster-rut">{t.rutShort} {Math.round(c.rut_score ?? 0)}</span>
                <span className={`cluster-sev sev-badge-${c.severity || "low"}`}>
                  {severityLabel(t, c.severity)}
                </span>
                {(c.detection_count ?? 0) > 1 && (
                  <span className="cluster-count">
                    {t.clusterReports.replace("{n}", String(c.detection_count))}
                  </span>
                )}
              </div>
              <p className="cluster-meta">
                {c.latitude?.toFixed(5)}, {c.longitude?.toFixed(5)}
              </p>
              {onSelectCluster && c.latitude != null && (
                <button
                  type="button"
                  className="cluster-map-btn"
                  onClick={() => onSelectCluster(c)}
                >
                  {t.viewOnMap}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
