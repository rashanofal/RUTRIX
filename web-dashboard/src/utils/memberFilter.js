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

export function filterDetectionsByMember(detections, memberFilter) {
  if (!Array.isArray(detections) || !memberFilter) return [];
  const f = normalizeMemberFilter(memberFilter);
  if (f.mode === "none") return [];
  if (f.mode === "all") return detections;
  const ids = new Set(f.userIds);
  return detections.filter((item) => ids.has(Number(item.reporter_user_id)));
}

export function formatSelectedCount(template, count) {
  const tpl = typeof template === "string" ? template : "{count}";
  return tpl.replace("{count}", String(count));
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace("@gmai.com", "@gmail.com");
}

/** Drop duplicate accounts (e.g. owner typo email) — keep the row with most activity. */
export function dedupeMembersByEmail(members) {
  const byKey = new Map();
  for (const m of members || []) {
    const email = normalizeEmail(m.email);
    const key = email || `id:${m.user_id}`;
    const score =
      (m.map_pins || 0) + (m.total_detections || 0) + (m.role === "owner" ? 1000 : 0);
    const prev = byKey.get(key);
    if (!prev || score > (prev._score || 0)) {
      byKey.set(key, { ...m, _score: score });
    }
  }
  return Array.from(byKey.values()).map(({ _score, ...m }) => m);
}

/** Include reporters visible on the map even if team API missed them (org merge lag). */
export function enrichMembersWithReporters(members, detections) {
  const byId = new Map(
    dedupeMembersByEmail(members).map((m) => [Number(m.user_id), { ...m }])
  );
  for (const item of detections || []) {
    const id = Number(item.reporter_user_id);
    if (!id || byId.has(id)) continue;
    const mine = detections.filter((x) => Number(x.reporter_user_id) === id);
    byId.set(id, {
      user_id: id,
      full_name: item.reporter_name || `#${id}`,
      email: "",
      role: "field",
      map_pins: mine.filter((x) => x.latitude != null && x.longitude != null).length,
      total_detections: mine.length,
    });
  }
  return dedupeMembersByEmail(Array.from(byId.values())).sort((a, b) =>
    String(a.full_name || "").localeCompare(String(b.full_name || ""), undefined, {
      sensitivity: "base",
    })
  );
}
