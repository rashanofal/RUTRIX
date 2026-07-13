import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { useIsOwner } from "../hooks/useIsAdmin";
import PotholeMap from "../components/PotholeMap";
import DetectionDetail from "../components/DetectionDetail";
import AdminPanel from "../components/AdminPanel";
import SupervisorMembersRail from "../components/SupervisorMembersRail";

export default function SupervisorPage({
  detections,
  selected,
  selectedId,
  onSelect,
  onDelete,
  deletingId,
  onClearMap,
  clearing,
  onMaintChanged,
  onConfirm,
  onVerify,
  onReject,
  wsConnected,
}) {
  const { t } = useLocale();
  const isOwner = useIsOwner();
  const [members, setMembers] = useState([]);
  const [filterUserId, setFilterUserId] = useState(null);

  const filteredDetections = useMemo(() => {
    if (filterUserId == null) return detections;
    return detections.filter((d) => d.reporter_user_id === filterUserId);
  }, [detections, filterUserId]);

  useEffect(() => {
    if (filterUserId == null) return;
    if (selectedId && !filteredDetections.some((d) => d.id === selectedId)) {
      onSelect?.(null);
    }
  }, [filterUserId, filteredDetections, selectedId, onSelect]);

  if (!isOwner) {
    return (
      <div className="page-supervisor page-supervisor-locked">
        <div className="supervisor-locked-card">
          <span className="supervisor-locked-icon" aria-hidden>
            🛡️
          </span>
          <h2>{t.adminPanelTitle}</h2>
          <p>{t.ownerOnlyHint}</p>
        </div>
      </div>
    );
  }

  const pinned = filteredDetections.filter(
    (d) => d.latitude != null && d.longitude != null
  ).length;
  const showNoPinsHint = filterUserId != null && pinned === 0;
  const reporters = new Set(
    filteredDetections.map((d) => d.reporter_user_id).filter(Boolean)
  ).size;

  return (
    <div className="page-supervisor">
      <header className="supervisor-hero">
        <div className="supervisor-hero-text">
          <h2 className="supervisor-title">{t.adminPanelTitle}</h2>
          <p className="supervisor-sub">{t.supervisorMapSub}</p>
        </div>
        <div className="supervisor-kpis">
          <article className="supervisor-kpi">
            <span className="supervisor-kpi-value">{pinned}</span>
            <span className="supervisor-kpi-label">{t.supervisorKpiPins}</span>
          </article>
          <article className="supervisor-kpi">
            <span className="supervisor-kpi-value">{members.length || "—"}</span>
            <span className="supervisor-kpi-label">{t.supervisorKpiMembers}</span>
          </article>
          <article className="supervisor-kpi">
            <span className="supervisor-kpi-value">{reporters || "—"}</span>
            <span className="supervisor-kpi-label">{t.supervisorKpiReporters}</span>
          </article>
          <article className="supervisor-kpi">
            <span className="supervisor-kpi-value">{filteredDetections.length}</span>
            <span className="supervisor-kpi-label">{t.supervisorKpiRecords}</span>
          </article>
          <span className={`supervisor-live ${wsConnected ? "on" : "off"}`}>
            <span className="supervisor-live-dot" />
            {wsConnected ? t.supervisorLiveOn : t.disconnected}
          </span>
        </div>
      </header>

      {filterUserId != null ? (
        <div className="supervisor-selected-banner" role="status">
          <span>
            {t.memberShowingOnMap}:{" "}
            <strong>
              {members.find((m) => m.user_id === filterUserId)?.full_name ||
                detections.find((d) => d.reporter_user_id === filterUserId)?.reporter_name ||
                `#${filterUserId}`}
            </strong>
          </span>
          <button type="button" className="supervisor-clear-select" onClick={() => setFilterUserId(null)}>
            {t.clearMemberSelection}
          </button>
        </div>
      ) : null}

      <section className="supervisor-map-section" aria-label={t.supervisorMapTitle}>
        <div className="supervisor-map-layout">
          <div className="supervisor-map-frame">
            <PotholeMap
              key={filterUserId ?? "all"}
              detections={filteredDetections}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
              deletingId={deletingId}
              refitOnChange
              showReporter
            />
            {showNoPinsHint ? (
              <div className="supervisor-map-empty" role="status">
                <p>{t.supervisorNoPinsForUser}</p>
              </div>
            ) : null}
          </div>
          <SupervisorMembersRail
            members={members}
            detections={detections}
            selectedUserId={filterUserId}
            onSelectUser={setFilterUserId}
          />
        </div>
        {selectedId && selected ? (
          <aside className="supervisor-map-drawer" aria-label={t.recent}>
            <button
              type="button"
              className="map-drawer-close"
              onClick={() => onSelect(null)}
              aria-label="Close"
            >
              ✕
            </button>
            <DetectionDetail
              selected={selected}
              detections={filteredDetections}
              deletingId={deletingId}
              onDelete={onDelete}
              onConfirm={onConfirm}
              onVerify={onVerify}
              onReject={onReject}
            />
          </aside>
        ) : null}
      </section>

      <AdminPanel
        detections={detections}
        onDelete={onDelete}
        deletingId={deletingId}
        onClearMap={onClearMap}
        clearing={clearing}
        onChanged={onMaintChanged}
        onMembersChange={setMembers}
        selectedUserId={filterUserId}
        onSelectUser={setFilterUserId}
        hideMemberTable
        supervisorMode
        embedded
      />
    </div>
  );
}
