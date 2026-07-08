import { useEffect, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { fetchMaintenanceDashboard } from "../hooks/useApi";

function pendingDetections(stats) {
  return stats?.by_status?.detected ?? 0;
}

function verifyRate(stats) {
  const total = stats?.total_detections ?? 0;
  const verified = stats?.verified_detections ?? 0;
  if (!total) return 0;
  return Math.round((100 * verified) / total);
}

export default function ExecutiveDashboard({ stats, refreshKey = 0 }) {
  const { t } = useLocale();
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchMaintenanceDashboard()
      .then(setDash)
      .catch(() => setDash({}))
      .finally(() => setLoading(false));
  }, [stats?.total_detections, refreshKey]);

  const d = dash || {};
  const hasWorkOrders =
    (d.open_work_orders ?? 0) > 0 ||
    (d.critical_open ?? 0) > 0 ||
    (d.completed_this_week ?? 0) > 0 ||
    (d.pending_verification ?? 0) > 0 ||
    (d.budget_estimate_open ?? 0) > 0;

  const hasDetections = (stats?.total_detections ?? 0) > 0;

  if (loading) {
    return (
      <section className="executive-dashboard section-card">
        <div className="section-label">
          <span className="section-label-icon">🏛️</span>
          <span>{t.executiveTitle}</span>
        </div>
        <p className="intel-empty">{t.loading}</p>
      </section>
    );
  }

  if (!hasWorkOrders && !hasDetections) {
    return (
      <section className="executive-dashboard section-card">
        <div className="section-label">
          <span className="section-label-icon">🏛️</span>
          <span>{t.executiveTitle}</span>
        </div>
        <p className="intel-sub">{t.executiveSub}</p>
        <p className="intel-empty">{t.noExecutiveData}</p>
      </section>
    );
  }

  const cards = hasWorkOrders
    ? [
        { key: "open", val: d.open_work_orders, label: t.execOpenOrders, icon: "📋", cls: "warn" },
        { key: "critical", val: d.critical_open, label: t.execCritical, icon: "🚨", cls: "danger" },
        { key: "week", val: d.completed_this_week, label: t.execCompletedWeek, icon: "✅", cls: "success" },
        { key: "verify", val: d.pending_verification, label: t.execPendingVerify, icon: "🔍", cls: "" },
        {
          key: "budget",
          val: `$${Math.round(d.budget_estimate_open || 0).toLocaleString()}`,
          label: t.execBudgetOpen,
          icon: "💰",
          cls: "",
        },
        { key: "rate", val: `${d.completion_rate ?? 0}%`, label: t.execCompletionRate, icon: "📈", cls: "primary" },
      ]
    : [
        { key: "total", val: stats.total_detections, label: t.execTotalDetections, icon: "📍", cls: "primary" },
        {
          key: "pending",
          val: pendingDetections(stats),
          label: t.execPendingDetections,
          icon: "📋",
          cls: "warn",
        },
        {
          key: "critical",
          val: stats.critical_count ?? 0,
          label: t.execCriticalDetections,
          icon: "🚨",
          cls: "danger",
        },
        {
          key: "budget",
          val: `$${Math.round(stats.total_repair_max || 0).toLocaleString()}`,
          label: t.execDetectionBudget,
          icon: "💰",
          cls: "",
        },
        {
          key: "rut",
          val: stats.avg_rut_score ?? 0,
          label: "RUT",
          icon: "📊",
          cls: "",
        },
        {
          key: "verify",
          val: `${verifyRate(stats)}%`,
          label: t.execVerifyRate,
          icon: "✅",
          cls: "success",
        },
      ];

  return (
    <section className="executive-dashboard section-card">
      <div className="section-label">
        <span className="section-label-icon">🏛️</span>
        <span>{t.executiveTitle}</span>
      </div>
      <p className="intel-sub">{t.executiveSub}</p>
      <div className="exec-grid">
        {cards.map((c) => (
          <div key={c.key} className={`exec-card ${c.cls}`}>
            <span className="exec-icon">{c.icon}</span>
            <span className="exec-val">{c.val}</span>
            <span className="exec-lbl">{c.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
