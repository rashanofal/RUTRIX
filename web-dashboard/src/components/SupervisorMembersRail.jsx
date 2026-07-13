import { useMemo } from "react";
import { useLocale } from "../context/LocaleContext";

/** @typedef {'none' | 'all' | 'users'} MemberFilterMode */

export function normalizeMemberFilter(memberFilter) {
  if (!memberFilter) return { mode: "none" };
  if (memberFilter.mode === "user" && memberFilter.userId != null) {
    return { mode: "users", userIds: [Number(memberFilter.userId)] };
  }
  if (memberFilter.mode === "users" && Array.isArray(memberFilter.userIds)) {
    const userIds = [...new Set(memberFilter.userIds.map(Number))].filter(Boolean);
    if (!userIds.length) return { mode: "none" };
    return { mode: "users", userIds };
  }
  if (memberFilter.mode === "all" || memberFilter.mode === "none") {
    return { mode: memberFilter.mode };
  }
  return { mode: "none" };
}

export function hasMemberSelection(memberFilter) {
  const f = normalizeMemberFilter(memberFilter);
  return f.mode === "all" || (f.mode === "users" && f.userIds.length > 0);
}

export function isMemberSelected(memberFilter, userId) {
  const f = normalizeMemberFilter(memberFilter);
  const id = Number(userId);
  if (f.mode === "all") return true;
  if (f.mode === "users") return f.userIds.includes(id);
  return false;
}

export function toggleMemberInFilter(memberFilter, userId, allUserIds = []) {
  const f = normalizeMemberFilter(memberFilter);
  const id = Number(userId);
  const all = allUserIds.map(Number).filter(Boolean);

  if (f.mode === "all") {
    const remaining = all.filter((uid) => uid !== id);
    if (!remaining.length) return { mode: "none" };
    return { mode: "users", userIds: remaining };
  }

  if (f.mode === "none") {
    return { mode: "users", userIds: [id] };
  }

  if (f.mode === "users") {
    const ids = new Set(f.userIds);
    if (ids.has(id)) {
      ids.delete(id);
      if (!ids.size) return { mode: "none" };
      return { mode: "users", userIds: Array.from(ids) };
    }
    ids.add(id);
    if (all.length && ids.size >= all.length) return { mode: "all" };
    return { mode: "users", userIds: Array.from(ids) };
  }

  return { mode: "users", userIds: [id] };
}

export function toggleAllMembersFilter(memberFilter) {
  const f = normalizeMemberFilter(memberFilter);
  if (f.mode === "all") return { mode: "none" };
  return { mode: "all" };
}

export function memberFilterKey(memberFilter) {
  const f = normalizeMemberFilter(memberFilter);
  if (f.mode === "none") return "none";
  if (f.mode === "all") return "all";
  return `users-${[...f.userIds].sort((a, b) => a - b).join(",")}`;
}

export function getSelectedUserIds(memberFilter) {
  const f = normalizeMemberFilter(memberFilter);
  if (f.mode === "users") return f.userIds;
  return [];
}

export function filterDetectionsByMember(detections, memberFilter) {
  if (!Array.isArray(detections) || !memberFilter) return [];
  const f = normalizeMemberFilter(memberFilter);
  if (f.mode === "none") return [];
  if (f.mode === "all") return detections;
  const ids = new Set(f.userIds);
  return detections.filter((d) => ids.has(Number(d.reporter_user_id)));
}

/** Include reporters visible on the map even if team API missed them (org merge lag). */
export function enrichMembersWithReporters(members, detections) {
  const byId = new Map(
    (Array.isArray(members) ? members : []).map((m) => [Number(m.user_id), { ...m }])
  );
  for (const d of detections || []) {
    const id = Number(d.reporter_user_id);
    if (!id || byId.has(id)) continue;
    const mine = detections.filter((x) => Number(x.reporter_user_id) === id);
    byId.set(id, {
      user_id: id,
      full_name: d.reporter_name || `#${id}`,
      email: "",
      role: "field",
      map_pins: mine.filter((x) => x.latitude != null && x.longitude != null).length,
      total_detections: mine.length,
    });
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(a.full_name || "").localeCompare(String(b.full_name || ""), undefined, {
      sensitivity: "base",
    })
  );
}

export default function SupervisorMembersRail({
  members = [],
  detections = [],
  memberFilter,
  onMemberFilterChange,
}) {
  const { t } = useLocale();
  const filter = normalizeMemberFilter(memberFilter);
  const allUserIds = useMemo(() => members.map((m) => Number(m.user_id)), [members]);

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

  const selectedCount =
    filter.mode === "all" ? members.length : filter.mode === "users" ? filter.userIds.length : 0;

  const toggleAll = () => onMemberFilterChange?.(toggleAllMembersFilter(filter));
  const toggleUser = (userId) =>
    onMemberFilterChange?.(toggleMemberInFilter(filter, userId, allUserIds));

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
            {t.supervisorSelectedCount.replace("{count}", String(selectedCount))}
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
