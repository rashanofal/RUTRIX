import { useMemo } from "react";
import { useLocale } from "../context/LocaleContext";

export default function SupervisorMembersRail({
  members = [],
  detections = [],
  selectedUserId,
  onSelectUser,
}) {
  const { t } = useLocale();

  const pinCounts = useMemo(() => {
    const counts = new Map();
    for (const d of detections) {
      if (d.latitude == null || d.longitude == null || !d.reporter_user_id) continue;
      counts.set(d.reporter_user_id, (counts.get(d.reporter_user_id) || 0) + 1);
    }
    return counts;
  }, [detections]);

  const totalPins = useMemo(
    () => detections.filter((d) => d.latitude != null && d.longitude != null).length,
    [detections]
  );

  const toggle = (userId) => {
    onSelectUser?.(selectedUserId === userId ? null : userId);
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
          className={`supervisor-member-chip${selectedUserId == null ? " active" : ""}`}
          onClick={() => onSelectUser?.(null)}
        >
          <span className="supervisor-member-name">{t.supervisorFilterAll}</span>
          <span className="supervisor-member-pins" dir="ltr">
            {totalPins}
          </span>
        </button>
        {members.map((m) => {
          const pins = pinCounts.get(m.user_id) ?? m.map_pins ?? 0;
          const active = selectedUserId === m.user_id;
          return (
            <button
              key={m.user_id}
              type="button"
              className={`supervisor-member-chip${active ? " active" : ""}`}
              onClick={() => toggle(m.user_id)}
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
