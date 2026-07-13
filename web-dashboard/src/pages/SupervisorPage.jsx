import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { useIsOwner } from "../hooks/useIsAdmin";
import { fetchTeamMembers } from "../hooks/useApi";
import PotholeMap from "../components/PotholeMap";
import DetectionDetail from "../components/DetectionDetail";
import AdminPanel from "../components/AdminPanel";
import SupervisorMembersRail, {
  enrichMembersWithReporters,
  filterDetectionsByMember,
} from "../components/SupervisorMembersRail";

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
  const [memberFilter, setMemberFilter] = useState({ mode: "none" });

  const loadMembers = useCallback(() => {
    fetchTeamMembers()
      .then((rows) => setMembers(Array.isArray(rows) ? rows : []))
      .catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    loadMembers();
  }, [isOwner, loadMembers, detections.length]);

  const displayMembers = useMemo(
    () => enrichMembersWithReporters(members, detections),
    [members, detections]
  );

  const filteredDetections = useMemo(
    () => filterDetectionsByMember(detections, memberFilter),
    [detections, memberFilter]
  );

  useEffect(() => {
    if (memberFilter.mode === "none") {
      if (selectedId) onSelect?.(null);
      return;
    }
    if (selectedId && !filteredDetections.some((d) => d.id === selectedId)) {
      onSelect?.(null);
    }
  }, [memberFilter, filteredDetections, selectedId, onSelect]);

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
  const showSelectPrompt = memberFilter.mode === "none";
  const showNoPinsHint =
    memberFilter.mode === "user" && pinned === 0;
  const reporters = new Set(
    filteredDetections.map((d) => d.reporter_user_id).filter(Boolean)
  ).size;

  const selectedMember =
    memberFilter.mode === "user"
      ? displayMembers.find((m) => Number(m.user_id) === Number(memberFilter.userId))
      : null;

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
            <span className="supervisor-kpi-value">{displayMembers.length || "—"}</span>
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

      {memberFilter.mode === "user" && selectedMember ? (
        <div className="supervisor-selected-banner" role="status">
          <span>
            {t.memberShowingOnMap}: <strong>{selectedMember.full_name}</strong>
          </span>
          <button
            type="button"
            className="supervisor-clear-select"
            onClick={() => setMemberFilter({ mode: "none" })}
          >
            {t.clearMemberSelection}
          </button>
        </div>
      ) : null}

      {memberFilter.mode === "all" ? (
        <div className="supervisor-selected-banner supervisor-selected-banner-all" role="status">
          <span>{t.supervisorShowingAll}</span>
          <button
            type="button"
            className="supervisor-clear-select"
            onClick={() => setMemberFilter({ mode: "none" })}
          >
            {t.clearMemberSelection}
          </button>
        </div>
      ) : null}

      <section className="supervisor-map-section" aria-label={t.supervisorMapTitle}>
        <div className="supervisor-map-layout">
          <div className="supervisor-map-frame">
            <PotholeMap
              key={`${memberFilter.mode}-${memberFilter.userId ?? "all"}`}
              detections={filteredDetections}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
              deletingId={deletingId}
              refitOnChange
              showReporter
            />
            {showSelectPrompt ? (
              <div className="supervisor-map-empty" role="status">
                <p>{t.supervisorSelectMemberPrompt}</p>
              </div>
            ) : null}
            {showNoPinsHint ? (
              <div className="supervisor-map-empty" role="status">
                <p>{t.supervisorNoPinsForUser}</p>
              </div>
            ) : null}
          </div>
          <SupervisorMembersRail
            members={displayMembers}
            detections={detections}
            memberFilter={memberFilter}
            onMemberFilterChange={setMemberFilter}
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
        detections={filteredDetections}
        onDelete={onDelete}
        deletingId={deletingId}
        onClearMap={onClearMap}
        clearing={clearing}
        onChanged={onMaintChanged}
        onMembersChange={setMembers}
        memberFilter={memberFilter}
        onMemberFilterChange={setMemberFilter}
        hideMemberTable
        supervisorMode
        embedded
      />
    </div>
  );
}
