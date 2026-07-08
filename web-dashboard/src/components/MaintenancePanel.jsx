import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import {
  createWorkOrder,
  fetchTeamMembers,
  fetchWorkOrders,
  updateWorkOrder,
} from "../hooks/useApi";
import NavIcon from "./NavIcons";

const STATUS_FLOW = ["open", "assigned", "in_progress", "completed", "verified"];
const CLOSED_STATUSES = new Set(["completed", "verified", "cancelled"]);

const STATUS_LABELS = {
  ar: {
    open: "مفتوح",
    assigned: "مُسند",
    in_progress: "قيد التنفيذ",
    completed: "مكتمل",
    verified: "مُتحقق",
    cancelled: "ملغى",
  },
  en: {
    open: "Open",
    assigned: "Assigned",
    in_progress: "In progress",
    completed: "Completed",
    verified: "Verified",
    cancelled: "Cancelled",
  },
};

function isActionableDetection(d) {
  return d && d.class_name !== "photo" && d.detection_status !== "rejected";
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function sortByMaintenancePriority(detections) {
  return [...detections].sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 4;
    const sb = SEVERITY_ORDER[b.severity] ?? 4;
    if (sa !== sb) return sa - sb;
    return (b.rut_score ?? b.priority_rank ?? 0) - (a.rut_score ?? a.priority_rank ?? 0);
  });
}

const PRIORITY_GROUPS = ["critical", "high", "medium", "low"];

function actionLabel(status, t) {
  switch (status) {
    case "open":
      return t.woActionAssign;
    case "assigned":
      return t.woActionStart;
    case "in_progress":
      return t.woActionComplete;
    case "completed":
      return t.woActionVerify;
    default:
      return t.advanceStatus;
  }
}

function WorkOrderPipeline({ status, t }) {
  const steps = [
    { key: "open", label: t.woStepOpen },
    { key: "assigned", label: t.woStepAssigned },
    { key: "in_progress", label: t.woStepProgress },
    { key: "completed", label: t.woStepCompleted },
    { key: "verified", label: t.woStepVerified },
  ];
  const currentIdx = STATUS_FLOW.indexOf(status);

  return (
    <div className="wo-pipeline" aria-label={t.woTrackingSub}>
      {steps.map((step, i) => {
        const done = currentIdx >= 0 && i < currentIdx;
        const current = step.key === status;
        return (
          <div
            key={step.key}
            className={`wo-pipeline-step ${done ? "done" : ""} ${current ? "current" : ""}`}
          >
            <span className="wo-pipeline-dot">{done ? "✓" : i + 1}</span>
            <span className="wo-pipeline-label">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function MaintenancePanel({
  detections = [],
  selected,
  onSelect,
  onRefresh,
  onChanged,
}) {
  const { t, locale } = useLocale();
  const [orders, setOrders] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, m] = await Promise.all([fetchWorkOrders(), fetchTeamMembers()]);
      setOrders(o);
      setTeam(m);
    } catch {
      setOrders([]);
      setTeam([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, onRefresh]);

  const liveDetectionIds = useMemo(() => new Set(detections.map((d) => d.id)), [detections]);

  const activeOrderDetectionIds = useMemo(
    () =>
      new Set(
        orders
          .filter((o) => o.detection_id && liveDetectionIds.has(o.detection_id))
          .filter((o) => !CLOSED_STATUSES.has(o.status))
          .map((o) => o.detection_id)
      ),
    [orders, liveDetectionIds]
  );

  const availableDetections = useMemo(
    () =>
      sortByMaintenancePriority(
        detections.filter(
          (d) => isActionableDetection(d) && !activeOrderDetectionIds.has(d.id)
        )
      ),
    [detections, activeOrderDetectionIds]
  );

  useEffect(() => {
    if (!availableDetections.length || !onSelect) return;
    const stillValid =
      selected && availableDetections.some((d) => d.id === selected.id);
    if (!stillValid) {
      onSelect(availableDetections[0].id);
    } else if (selected && !detections.some((d) => d.id === selected.id)) {
      onSelect(null);
    }
  }, [availableDetections, selected, onSelect, detections]);

  const handleCreate = async () => {
    if (!selected?.id) {
      window.alert(t.selectDetectionFirst);
      return;
    }
    setCreating(true);
    try {
      await createWorkOrder({ detection_id: selected.id });
      await load();
      onChanged?.();
      window.alert(t.workOrderCreated);
    } catch (err) {
      const detail = err?.message && err.message !== "Create work order failed" ? err.message : "";
      window.alert(detail ? `${t.workOrderFail}\n${detail}` : t.workOrderFail);
    } finally {
      setCreating(false);
    }
  };

  const advanceStatus = async (order) => {
    const idx = STATUS_FLOW.indexOf(order.status);
    const next = idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : order.status;
    const payload = { status: next };

    if (order.status === "open" && !order.assigned_to_user_id) {
      window.alert(t.unassigned);
      return;
    }

    if (order.status === "in_progress") {
      const notes = noteDrafts[order.id]?.trim();
      if (notes) payload.notes = notes;
    }

    if (order.status === "completed") {
      if (!window.confirm(`${t.woActionVerify}?`)) return;
    }

    try {
      await updateWorkOrder(order.id, payload);
      await load();
      onChanged?.();
    } catch {
      window.alert(t.workOrderFail);
    }
  };

  const assignTo = async (order, userId) => {
    try {
      await updateWorkOrder(order.id, {
        assigned_to_user_id: Number(userId) || null,
        status: userId ? "assigned" : "open",
      });
      await load();
    } catch {
      window.alert(t.workOrderFail);
    }
  };

  const cancelOrder = async (order) => {
    if (!window.confirm(t.woCancelConfirm)) return;
    try {
      await updateWorkOrder(order.id, { status: "cancelled" });
      await load();
      onChanged?.();
    } catch {
      window.alert(t.workOrderFail);
    }
  };

  const labels = STATUS_LABELS[locale] || STATUS_LABELS.ar;
  const severityLabels = {
    critical: t.sevCritical,
    high: t.sevHigh,
    medium: t.sevMedium,
    low: t.sevLow,
  };

  const sortedOrders = useMemo(
    () =>
      [...orders]
        .filter((wo) => !wo.detection_id || liveDetectionIds.has(wo.detection_id))
        .filter((wo) => wo.status !== "cancelled")
        .sort((a, b) => {
          const pa = SEVERITY_ORDER[a.priority] ?? 4;
          const pb = SEVERITY_ORDER[b.priority] ?? 4;
          if (pa !== pb) return pa - pb;
          return (b.detection?.rut_score ?? 0) - (a.detection?.rut_score ?? 0);
        }),
    [orders, liveDetectionIds]
  );

  return (
    <section className="maintenance-panel section-card">
      <div className="section-label">
        <span className="section-label-icon"><NavIcon name="ops" /></span>
        <span>{t.maintenanceTitle}</span>
      </div>
      <p className="intel-sub">{t.maintenanceSub}</p>

      <div className="wo-create-block">
        <label className="wo-detection-label" htmlFor="wo-detection-select">
          {t.pickDetection}
        </label>
        <p className="wo-priority-hint">{t.maintenancePriorityHint}</p>
        {availableDetections.length ? (
          <select
            id="wo-detection-select"
            className="wo-detection-select"
            value={selected?.id ?? ""}
            onChange={(e) => onSelect?.(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t.pickDetectionHint}</option>
            {PRIORITY_GROUPS.map((sev) => {
              const group = availableDetections.filter(
                (d) => (d.severity || "low") === sev
              );
              if (!group.length) return null;
              return (
                <optgroup key={sev} label={severityLabels[sev]}>
                  {group.map((d) => (
                    <option key={d.id} value={d.id}>
                      #{d.id} — RUT {d.rut_score ?? 0} · {severityLabels[sev]}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        ) : (
          <p className="wo-detection-empty">{t.noDetectionsForOrder}</p>
        )}

        <button
          type="button"
          className="create-wo-btn"
          disabled={creating || !selected?.id || !availableDetections.length}
          onClick={handleCreate}
        >
          {creating ? t.loading : `➕ ${t.createWorkOrder}`}
        </button>
      </div>

      <h3 className="intel-h3 wo-tracking-heading">
        {t.woTrackingTitle}
        {!loading && sortedOrders.length > 0 ? ` (${sortedOrders.length})` : ""}
      </h3>
      <p className="wo-tracking-sub">{t.woTrackingSub}</p>

      {loading ? (
        <p className="intel-empty">{t.loading}</p>
      ) : (
        <ul className="wo-list">
          {sortedOrders.map((wo) => (
            <li key={wo.id} className={`wo-item priority-${wo.priority} status-${wo.status}`}>
              <div className="wo-top">
                <strong>#{wo.id}</strong>
                <span className={`wo-status-badge status-${wo.status}`}>
                  {labels[wo.status] || wo.status}
                </span>
              </div>
              <p className="wo-title">{wo.title}</p>
              {wo.detection && (
                <p className="wo-meta">
                  RUT {wo.detection.rut_score} · {wo.detection.anomaly_type}
                  {wo.assignee_name ? ` · ${wo.assignee_name}` : ""}
                </p>
              )}

              <WorkOrderPipeline status={wo.status} t={t} />

              {wo.status === "in_progress" && (
                <div className="wo-notes-block">
                  <label className="wo-notes-label" htmlFor={`wo-notes-${wo.id}`}>
                    {t.woNotesPrompt}
                  </label>
                  <textarea
                    id={`wo-notes-${wo.id}`}
                    className="wo-notes-input"
                    rows={2}
                    placeholder={t.woNotesPlaceholder}
                    value={noteDrafts[wo.id] ?? wo.notes ?? ""}
                    onChange={(e) =>
                      setNoteDrafts((prev) => ({ ...prev, [wo.id]: e.target.value }))
                    }
                  />
                </div>
              )}

              {wo.notes && wo.status !== "in_progress" && (
                <p className="wo-notes-display">📝 {wo.notes}</p>
              )}

              {wo.completed_at && (
                <p className="wo-completed-at">
                  {t.woCompletedAt}: {new Date(wo.completed_at).toLocaleString()}
                </p>
              )}

              <div className="wo-actions">
                <select
                  className="wo-assign-select"
                  value={wo.assigned_to_user_id || ""}
                  onChange={(e) => assignTo(wo, e.target.value)}
                  disabled={wo.status === "verified"}
                >
                  <option value="">{t.unassigned}</option>
                  {team.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
                {wo.status !== "verified" && wo.status !== "cancelled" && (
                  <>
                    <button
                      type="button"
                      className="wo-advance-btn"
                      onClick={() => advanceStatus(wo)}
                    >
                      {actionLabel(wo.status, t)}
                    </button>
                    {wo.status === "open" && (
                      <button
                        type="button"
                        className="wo-cancel-btn"
                        onClick={() => cancelOrder(wo)}
                      >
                        {t.woCancelOrder}
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
          {!sortedOrders.length && <li className="intel-empty">{t.noWorkOrders}</li>}
        </ul>
      )}
    </section>
  );
}
