import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import {
  fetchTeamMembers,
  inviteTeamMember,
  removeTeamMember,
  resetTeamMemberPassword,
} from "../hooks/useApi";
import { useIsAdmin, useIsOwner } from "../hooks/useIsAdmin";
import {
  filterDetectionsByMember,
  hasMemberSelection,
  isMemberSelected,
  toggleMemberInFilter,
} from "../utils/memberFilter";

const ROLES = ["field", "admin", "viewer"];

const ROLE_LABELS = {
  ar: { owner: "مالك", admin: "مشرف", field: "ميداني", viewer: "مشاهد" },
  en: { owner: "Owner", admin: "Admin", field: "Field", viewer: "Viewer" },
};

function groupMedia(detections) {
  const map = new Map();
  for (const d of detections) {
    if (!d.image_url) continue;
    if (!map.has(d.image_url)) {
      map.set(d.image_url, { url: d.image_url, items: [], primary: d });
    }
    map.get(d.image_url).items.push(d);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.primary.created_at) - new Date(a.primary.created_at)
  );
}

export default function AdminPanel({
  detections = [],
  onDelete,
  deletingId,
  onClearMap,
  clearing,
  onChanged,
  embedded = false,
  supervisorMode = false,
  onMembersChange,
  memberFilter = { mode: "none" },
  onMemberFilterChange,
  hideMemberTable = false,
}) {
  const { t, locale } = useLocale();
  const isAdmin = useIsAdmin();
  const isOwner = useIsOwner();
  const canManage = supervisorMode ? isOwner : isAdmin;
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showFullTable, setShowFullTable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "field",
  });

  const roleLabels = ROLE_LABELS[locale] || ROLE_LABELS.ar;
  const selectionActive = supervisorMode ? hasMemberSelection(memberFilter) : true;
  const visibleDetections = useMemo(() => {
    if (!supervisorMode) return detections;
    return filterDetectionsByMember(detections, memberFilter);
  }, [detections, supervisorMode, memberFilter]);
  const media = useMemo(() => groupMedia(visibleDetections), [visibleDetections]);

  const toggleMember = (member) => {
    if (!onMemberFilterChange) return;
    const allUserIds = members.map((m) => Number(m.user_id));
    onMemberFilterChange(toggleMemberInFilter(memberFilter, member.user_id, allUserIds));
  };

  const loadMembers = () => {
    fetchTeamMembers()
      .then((rows) => {
        setMembers(rows);
        onMembersChange?.(rows);
      })
      .catch(() => {
        setMembers([]);
        onMembersChange?.([]);
      });
  };

  useEffect(() => {
    if (canManage) loadMembers();
  }, [canManage]);

  if (!canManage) {
    if (embedded) return null;
    return (
      <section className="admin-panel section-card admin-panel-locked">
        <p className="intel-sub">{supervisorMode ? t.ownerOnlyHint : t.adminOnlyHint}</p>
      </section>
    );
  }

  const submitInvite = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await inviteTeamMember(form);
      setForm({ email: "", password: "", full_name: "", role: "field" });
      setShowForm(false);
      loadMembers();
    } catch {
      window.alert(t.inviteFail);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (member) => {
    if (member.role === "owner") return;
    if (!window.confirm(t.removeMemberConfirm.replace("{name}", member.full_name))) return;
    try {
      await removeTeamMember(member.user_id);
      loadMembers();
      onChanged?.();
    } catch (err) {
      window.alert(err?.message || t.removeMemberFail);
    }
  };

  const handleResetPassword = async (member) => {
    const next = window.prompt(t.resetPasswordPrompt, member.provisioned_password || "");
    if (!next || next.length < 6) return;
    try {
      await resetTeamMemberPassword(member.user_id, next);
      loadMembers();
      window.alert(t.resetPasswordDone);
    } catch (err) {
      window.alert(err?.message || t.resetPasswordFail);
    }
  };

  const formatWhen = (iso) => {
    if (!iso) return t.neverLoggedIn;
    try {
      return new Date(iso).toLocaleString(locale === "ar" ? "ar-EG" : "en-GB");
    } catch {
      return "—";
    }
  };

  return (
    <section
      className={`admin-panel section-card${embedded ? " admin-panel-embedded" : ""}${
        supervisorMode ? " admin-panel-supervisor" : ""
      }`}
    >
      {!embedded ? (
        <div className="section-label">
          <span className="section-label-icon">🛡️</span>
          <span>{t.adminPanelTitle}</span>
        </div>
      ) : null}

      {!(supervisorMode && hideMemberTable) ? (
        <>
          <h3 className="intel-h3">
            {t.adminUsersTitle} ({members.length})
          </h3>
          {supervisorMode && hideMemberTable ? (
            <button
              type="button"
              className="supervisor-table-toggle"
              onClick={() => setShowFullTable((v) => !v)}
              aria-expanded={showFullTable}
            >
              {showFullTable ? t.supervisorHideTable : t.supervisorShowTable}
            </button>
          ) : null}
          {supervisorMode && (!hideMemberTable || showFullTable) ? (
            <p className="intel-sub admin-users-sub">{t.adminUsersSub}</p>
          ) : null}

          {(!hideMemberTable || showFullTable) ? (
          <div className="admin-table-wrap">
        <table className={`admin-table${supervisorMode ? " admin-table-supervisor" : ""}`}>
          <thead>
            <tr>
              {supervisorMode ? <th className="admin-select-col" aria-label={t.memberSelectCol} /> : null}
              <th>{t.fullName}</th>
              <th>{t.email}</th>
              {supervisorMode ? <th>{t.memberPassword}</th> : null}
              <th>{t.roleCol}</th>
              {supervisorMode ? (
                <>
                  <th>{t.memberDashboard}</th>
                  <th>{t.memberPhone}</th>
                  <th>{t.memberMapPins}</th>
                  <th>{t.memberDetections}</th>
                </>
              ) : null}
              <th>{t.lastLogin}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelected = supervisorMode && isMemberSelected(memberFilter, m.user_id);
              return (
              <tr
                key={m.user_id}
                className={isSelected ? "admin-row-selected" : supervisorMode ? "admin-row-selectable" : undefined}
                onClick={supervisorMode ? () => toggleMember(m) : undefined}
                onKeyDown={
                  supervisorMode
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleMember(m);
                        }
                      }
                    : undefined
                }
                tabIndex={supervisorMode ? 0 : undefined}
                role={supervisorMode ? "button" : undefined}
                aria-pressed={supervisorMode ? isSelected : undefined}
              >
                {supervisorMode ? (
                  <td className="admin-select-col" aria-hidden>
                    <span className={`admin-select-dot${isSelected ? " on" : ""}`} />
                  </td>
                ) : null}
                <td>{m.full_name}</td>
                <td dir="ltr" className="admin-email">
                  {m.email}
                </td>
                {supervisorMode ? (
                  <td dir="ltr" className="admin-password">
                    <code>{m.provisioned_password || t.memberPasswordUnknown}</code>
                  </td>
                ) : null}
                <td>
                  <span className={`team-role-pill role-${m.role}`}>
                    {roleLabels[m.role] || m.role}
                  </span>
                </td>
                {supervisorMode ? (
                  <>
                    <td className="admin-num" dir="ltr">
                      {m.dashboard_uploads ?? 0}
                    </td>
                    <td className="admin-num" dir="ltr">
                      {m.phone_uploads ?? 0}
                    </td>
                    <td className="admin-num" dir="ltr">
                      {m.map_pins ?? 0}
                    </td>
                    <td className="admin-num" dir="ltr">
                      {m.total_detections ?? 0}
                    </td>
                  </>
                ) : null}
                <td className="admin-when">{formatWhen(m.last_login_at)}</td>
                <td className="admin-actions" onClick={(e) => e.stopPropagation()}>
                  {m.role !== "owner" ? (
                    <div className="admin-action-btns">
                      {supervisorMode ? (
                        <button
                          type="button"
                          className="admin-reset-btn"
                          onClick={() => handleResetPassword(m)}
                        >
                          {t.resetPassword}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="admin-remove-btn"
                        onClick={() => handleRemove(m)}
                      >
                        {t.removeMember}
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            );
            })}
            {!members.length && (
              <tr>
                <td colSpan={supervisorMode ? 11 : 5} className="intel-empty">
                  {t.noTeamMembers}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      ) : null}

      {supervisorMode && showFullTable ? (
        <p className="admin-password-hint">{t.memberPasswordHint}</p>
      ) : null}

      {!showForm ? (
        <button type="button" className="team-invite-btn" onClick={() => setShowForm(true)}>
          + {t.inviteMember}
        </button>
      ) : (
        <form className="team-form" onSubmit={submitInvite}>
          <input
            placeholder={t.fullName}
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
          <input
            type="email"
            placeholder={t.email}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder={t.password}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={6}
            autoComplete="new-password"
          />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r] || r}
              </option>
            ))}
          </select>
          <div className="team-form-actions">
            <button type="submit" disabled={saving}>
              {saving ? t.loading : t.inviteMember}
            </button>
            <button type="button" onClick={() => setShowForm(false)}>
              {t.cancel}
            </button>
          </div>
        </form>
      )}

        </>
      ) : null}

      <h3 className="intel-h3 admin-media-title">
        {t.adminMediaTitle}
        {selectionActive ? ` (${media.length})` : ""}
      </h3>
      {!supervisorMode ? <p className="intel-sub">{t.adminMediaSub}</p> : null}
      <div className="admin-media-grid">
        {selectionActive
          ? media.map(({ url, items, primary }) => (
          <article key={url} className="admin-media-card">
            <img src={url} alt="" className="admin-media-img" loading="lazy" />
            <div className="admin-media-meta">
              <span>{primary.reporter_name || t.unknownReporter}</span>
              <span>{new Date(primary.created_at).toLocaleDateString()}</span>
              <span>
                {items.length} {t.records}
              </span>
            </div>
            <button
              type="button"
              className="admin-media-delete"
              disabled={deletingId === primary.id}
              onClick={() => onDelete?.(primary.id)}
            >
              {deletingId === primary.id ? t.deleting : `🗑️ ${t.delete}`}
            </button>
          </article>
        ))
          : null}
        {selectionActive && !media.length ? (
          <p className="intel-empty">{t.noFieldPhotos}</p>
        ) : null}
      </div>

      <div className="admin-danger">
        <h3 className="ops-danger-title">{t.dangerZone}</h3>
        {!supervisorMode ? <p className="ops-danger-desc">{t.dangerZoneDesc}</p> : null}
        <button
          type="button"
          className="clear-map-btn"
          onClick={onClearMap}
          disabled={clearing}
        >
          {clearing ? t.clearing : `🗑️ ${t.clearMap}`}
        </button>
      </div>
    </section>
  );
}
