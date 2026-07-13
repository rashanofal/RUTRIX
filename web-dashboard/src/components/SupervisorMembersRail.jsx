import { useMemo } from "react";
import { useLocale } from "../context/LocaleContext";

/** @typedef {'none' | 'all' | 'user'} MemberFilterMode */

export function filterDetectionsByMember(detections, memberFilter) {
  if (!Array.isArray(detections) || !memberFilter) return [];
  if (memberFilter.mode === "none") return [];
  if (memberFilter.mode === "all") return detections;
  const userId = Number(memberFilter.userId);
  return detections.filter((d) => Number(d.reporter_user_id) === userId);
}

export default function SupervisorMembersRail({
  members = [],
  detections = [],
  memberFilter,
  onMemberFilterChange,
}) {
  const { t } = useLocale();

  const pinCounts = useMemo(() => {
    const counts = new Map();
    for (const d of detections) {
      if (d.latitude == null || d.longitude == null || d.reporter_user_id == null) continue;
      const id = Number(d.reporter_user_id);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [detections]);

  const totalPins = useMemo(
    () => detections.filter((d) => d.latitude != null && d.longitude != null).length,
    [detections]
  );

  const setAll = () => onMemberFilterChange?.({ mode: "all" });
  const setUser = (userId) => {
    const id = Number(userId);
    if (memberFilter?.mode === "user" && Number(memberFilter.userId) === id) {
      onMemberFilterChange?.({ mode: "none" });
      return;
    }
    onMemberFilterChange?.({ mode: "user", userId: id });
  };

  return (
    <aside className="supervisor-members-rail" aria-label={t.supervisorMembersRail}>
      <div className="supervisor-members-rail-head">
        <h3>{t.supervisorMembersRail}</h3>
        <p>{t.memberSelectHint}</p>
      </div>
      <div className="supervisor-members-rail-list">
        <button
          type="button"
          className={`supervisor-member-chip${memberFilter?.mode === "all" ? " active" : ""}`}
          onClick={setAll}
        >
          <span className="supervisor-member-name">{t.supervisorFilterAll}</span>
          <span className="supervisor-member-pins" dir="ltr">
            {totalPins}
          </span>
        </button>
        {members.map((m) => {
          const id = Number(m.user_id);
          const pins = pinCounts.get(id) ?? m.map_pins ?? 0;
          const active = memberFilter?.mode === "user" && Number(memberFilter.userId) === id;
          return (
            <button
              key={m.user_id}
              type="button"
              className={`supervisor-member-chip${active ? " active" : ""}`}
              onClick={() => setUser(id)}
              aria-pressed={active}
            >
              <span className="supervisor-member-dot" aria-hidden />
              <span className="supervisor-member-name">{m.full_name}</span>
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
