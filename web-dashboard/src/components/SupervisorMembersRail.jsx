import { useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import {
  isMemberSelected,
  normalizeMemberFilter,
  toggleAllMembersFilter,
  toggleMemberInFilter,
} from "../utils/memberFilter";

export {
  dedupeMembersByEmail,
  enrichMembersWithReporters,
  filterDetectionsByMember,
  hasMemberSelection,
  isMemberSelected,
  memberFilterKey,
  normalizeMemberFilter,
  toggleMemberInFilter,
} from "../utils/memberFilter";

export default function SupervisorMembersRail({
  members = [],
  detections = [],
  memberFilter,
  onMemberFilterChange,
  onRemoveMember,
}) {
  const { t } = useLocale();
  const [removingId, setRemovingId] = useState(null);
  const filter = useMemo(() => normalizeMemberFilter(memberFilter), [memberFilter]);
  const allUserIds = useMemo(() => members.map((m) => Number(m.user_id)), [members]);

  const pinCounts = useMemo(() => {
    const counts = new Map();
    for (const item of detections) {
      if (item.latitude == null || item.longitude == null || item.reporter_user_id == null) continue;
      const id = Number(item.reporter_user_id);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [detections]);

  const totalPins = useMemo(
    () => detections.filter((item) => item.latitude != null && item.longitude != null).length,
    [detections]
  );

  const toggleAll = () => {
    if (typeof onMemberFilterChange !== "function") return;
    onMemberFilterChange(toggleAllMembersFilter(memberFilter));
  };

  const toggleUser = (userId) => {
    if (typeof onMemberFilterChange !== "function") return;
    onMemberFilterChange(toggleMemberInFilter(memberFilter, userId, allUserIds));
  };

  const handleRemove = async (member, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof onRemoveMember !== "function") return;
    if (member.role === "owner") return;
    const ok = window.confirm(
      (t.removeMemberConfirm || "Delete {name}?").replace("{name}", member.full_name || member.email)
    );
    if (!ok) return;
    setRemovingId(member.user_id);
    try {
      await onRemoveMember(member);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <aside className="supervisor-members-rail" aria-label={t.supervisorMembersRail}>
      <div className="supervisor-members-rail-head">
        <div className="supervisor-members-rail-head-row">
          <h3>{t.supervisorMembersRail}</h3>
          <span className="supervisor-members-count" dir="ltr">
            {members.length}
          </span>
        </div>
      </div>
      <div
        className="supervisor-members-rail-list"
        role="group"
        aria-label={t.supervisorMembersRail}
      >
        <button
          type="button"
          className={`supervisor-member-chip${filter.mode === "all" ? " active" : ""}`}
          onClick={toggleAll}
          aria-pressed={filter.mode === "all"}
        >
          <span className="supervisor-member-name">{t.supervisorFilterAll}</span>
          <span className="supervisor-member-pins" dir="ltr">
            {totalPins}
          </span>
        </button>
        {members.map((m) => {
          const id = Number(m.user_id);
          const pins = pinCounts.get(id) ?? m.map_pins ?? 0;
          const active = isMemberSelected(filter, id);
          const canDelete = m.role !== "owner" && typeof onRemoveMember === "function";
          const busy = removingId === m.user_id;
          return (
            <div
              key={m.user_id}
              className={`supervisor-member-row${active ? " active" : ""}`}
            >
              <button
                type="button"
                className={`supervisor-member-chip${active ? " active" : ""}`}
                onClick={() => toggleUser(id)}
                aria-pressed={active}
              >
                <span className={`supervisor-member-dot${active ? " on" : ""}`} aria-hidden />
                <span className="supervisor-member-text">
                  <span className="supervisor-member-name">{m.full_name}</span>
                  {m.email ? (
                    <span className="supervisor-member-email" dir="ltr">
                      {m.email}
                    </span>
                  ) : null}
                </span>
                <span className="supervisor-member-pins" dir="ltr" title={t.memberMapPins}>
                  {pins}
                </span>
              </button>
              {canDelete ? (
                <button
                  type="button"
                  className="supervisor-member-delete"
                  title={t.removeMemberTitle || t.removeMember}
                  aria-label={`${t.removeMember} ${m.full_name}`}
                  disabled={busy}
                  onClick={(e) => handleRemove(m, e)}
                >
                  {busy ? "…" : "🗑️"}
                </button>
              ) : null}
            </div>
          );
        })}
        {!members.length ? (
          <p className="supervisor-members-empty">{t.noTeamMembers}</p>
        ) : null}
      </div>
    </aside>
  );
}
