import { useEffect, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import {
  fetchLeaderboard,
  fetchPriorities,
  openReportHtml,
  openReportPdf,
} from "../hooks/useApi";
import ClusterSummaryPanel from "./ClusterSummaryPanel";
import NavIcon from "./NavIcons";

const SEV_LABELS = {
  ar: { low: "منخفضة", medium: "متوسطة", high: "عالية", critical: "حرجة" },
  en: { low: "Low", medium: "Medium", high: "High", critical: "Critical" },
};

export default function IntelligencePanel({ stats, refreshKey = 0, detections = [] }) {
  const { t, locale } = useLocale();
  const [priorities, setPriorities] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [p, l] = await Promise.all([fetchPriorities(15), fetchLeaderboard(8)]);
        const ids = new Set(detections.map((d) => d.id));
        setPriorities(p.filter((item) => ids.has(item.id)));
        setLeaders(l);
      } catch {
        setPriorities([]);
        setLeaders([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [stats?.total_detections, refreshKey, detections]);

  const sev = SEV_LABELS[locale] || SEV_LABELS.ar;

  return (
    <section className="intelligence-panel section-card">
      <div className="section-label">
        <span className="section-label-icon"><NavIcon name="intel" /></span>
        <span>{t.intelligenceTitle}</span>
      </div>
      <p className="intel-sub">{t.intelligenceSub}</p>

      <div className="intel-metrics">
        <div className="intel-metric">
          <span className="intel-metric-val">{stats?.avg_rut_score ?? 0}</span>
          <span className="intel-metric-lbl">RUT</span>
        </div>
        <div className="intel-metric">
          <span className="intel-metric-val">{stats?.critical_count ?? 0}</span>
          <span className="intel-metric-lbl">{t.sevCritical}</span>
        </div>
        <div className="intel-metric">
          <span className="intel-metric-val">
            ${Math.round(stats?.total_repair_min ?? 0).toLocaleString()}
          </span>
          <span className="intel-metric-lbl">{t.repairEst}</span>
        </div>
      </div>

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

      <ClusterSummaryPanel refreshKey={refreshKey} />

      <h3 className="intel-h3">
        {t.prioritiesTitle}
        {!loading && priorities.length > 0 ? ` (${priorities.length})` : ""}
      </h3>
      {loading ? (
        <p className="intel-empty">{t.loading}</p>
      ) : (
        <ul className="priority-list">
          {priorities.map((p) => (
            <li key={p.id} className={`priority-item sev-${p.severity}`}>
              <div className="priority-top">
                <span className="priority-id">#{p.id}</span>
                <span className="priority-rut">RUT {p.rut_score}</span>
                <span className={`priority-sev sev-badge-${p.severity}`}>
                  {sev[p.severity] || p.severity}
                </span>
              </div>
              <div className="priority-meta">
                {p.anomaly_type} · {p.estimated_depth_cm}cm × {p.estimated_width_cm}cm ·
                ${p.repair_cost_min?.toFixed(0)}–${p.repair_cost_max?.toFixed(0)}
              </div>
              {p.predicted_days_to_critical != null && (
                <div className="priority-warn">
                  ⚠ {t.predictDays}: {p.predicted_days_to_critical} {t.days}
                </div>
              )}
            </li>
          ))}
          {!priorities.length && <li className="intel-empty">{t.noPriorities}</li>}
        </ul>
      )}

      <h3 className="intel-h3">{t.leaderboardTitle}</h3>
      <ul className="leader-list">
        {leaders.map((u) => (
          <li key={u.user_id} className="leader-item">
            <span className="leader-rank">{u.rank}</span>
            <span className="leader-name">{u.full_name}</span>
            <span className="leader-pts">{u.points} {t.points}</span>
          </li>
        ))}
        {!leaders.length && <li className="intel-empty">{t.noLeaders}</li>}
      </ul>
    </section>
  );
}
