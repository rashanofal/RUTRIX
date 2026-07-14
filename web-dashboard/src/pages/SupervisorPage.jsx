import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { useIsOwner } from "../hooks/useIsAdmin";
import { fetchTeamMembers, removeTeamMember } from "../hooks/useApi";
import PotholeMap from "../components/PotholeMap";
import DetectionDetail from "../components/DetectionDetail";
import AdminPanel from "../components/AdminPanel";
import SupervisorMembersRail from "../components/SupervisorMembersRail";
import PageExportToolbar from "../components/PageExportToolbar";
import {
  enrichMembersWithReporters,
  filterDetectionsByMember,
  hasMemberSelection,
  isMemberSelected,
  normalizeMemberFilter,
} from "../utils/memberFilter";

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
    if (!hasMemberSelection(memberFilter)) {
      if (selectedId) onSelect?.(null);
      return;
    }
    if (selectedId && !filteredDetections.some((item) => item.id === selectedId)) {
      onSelect?.(null);
    }
  }, [memberFilter, filteredDetections, selectedId, onSelect]);

  const handleRemoveMember = useCallback(
    async (member) => {
      try {
        await removeTeamMember(member.user_id);
        setMembers((prev) => prev.filter((m) => Number(m.user_id) !== Number(member.user_id)));
        if (isMemberSelected(memberFilter, member.user_id)) {
          const f = normalizeMemberFilter(memberFilter);
          if (f.mode === "all") {
            /* keep all — remaining users still show */
          } else if (f.mode === "users") {
            const next = f.userIds.filter((id) => id !== Number(member.user_id));
            setMemberFilter(next.length ? { mode: "users", userIds: next } : { mode: "none" });
          }
        }
        onMaintChanged?.();
      } catch (err) {
        window.alert(err?.message || t.removeMemberFail);
        throw err;
      }
    },
    [memberFilter, onMaintChanged, t.removeMemberFail]
  );

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
    (item) => item.latitude != null && item.longitude != null
  ).length;
  const reporters = new Set(
    filteredDetections.map((item) => item.reporter_user_id).filter(Boolean)
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

      <PageExportToolbar variant="compact" className="supervisor-report-panel" exportContext={{ detections: filteredDetections }} />

      <section className="supervisor-map-section" aria-label={t.supervisorMapTitle}>
        <div className="supervisor-map-layout">
          <div className="supervisor-map-frame">
            <PotholeMap
              detections={filteredDetections}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
              deletingId={deletingId}
              refitOnChange
              showReporter
            />
          </div>
          <SupervisorMembersRail
            members={displayMembers}
            detections={detections}
            memberFilter={memberFilter}
            onMemberFilterChange={setMemberFilter}
            onRemoveMember={handleRemoveMember}
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
        memberFilter={memberFilter}
        onMemberFilterChange={setMemberFilter}
        hideMemberTable
        supervisorMode
        embedded
      />
    </div>
  );
}
