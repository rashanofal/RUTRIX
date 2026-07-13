import { useMemo } from "react";
import { useLocale } from "../context/LocaleContext";
import {
  enrichMembersWithReporters,
  filterDetectionsByMember,
  formatSelectedCount,
  isMemberSelected,
  normalizeMemberFilter,
  toggleAllMembersFilter,
  toggleMemberInFilter,
} from "../utils/memberFilter";

export {
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
}) {
  const { t } = useLocale();
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

  const selectedCount =
    filter.mode === "all" ? members.length : filter.mode === "users" ? filter.userIds.length : 0;

  const toggleAll = () => {
    if (typeof onMemberFilterChange !== "function") return;
    onMemberFilterChange(toggleAllMembersFilter(filter));
  };

  const toggleUser = (userId) => {
    if (typeof onMemberFilterChange !== "function") return;
    onMemberFilterChange(toggleMemberInFilter(filter, userId, allUserIds));
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
        <p>{t.memberSelectHint}</p>
        {selectedCount > 0 && filter.mode !== "all" ? (
          <p className="supervisor-members-selected-count" dir="ltr">
            {formatSelectedCount(t.supervisorSelectedCount, selectedCount)}
          </p>
        ) : null}
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
          return (
            <button
              key={m.user_id}
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
          );
        })}
        {!members.length ? (
          <p className="supervisor-members-empty">{t.noTeamMembers}</p>
        ) : null}
      </div>
    </aside>
  );
}
