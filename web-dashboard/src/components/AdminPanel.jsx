import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import {
  fetchTeamMembers,
  inviteTeamMember,
  removeTeamMember,
} from "../hooks/useApi";
import { useIsAdmin } from "../hooks/useIsAdmin";

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
}) {
  const { t, locale } = useLocale();
  const isAdmin = useIsAdmin();
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "field",
  });

  const roleLabels = ROLE_LABELS[locale] || ROLE_LABELS.ar;
  const media = useMemo(() => groupMedia(detections), [detections]);

  const loadMembers = () => {
    fetchTeamMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  };

  useEffect(() => {
    if (isAdmin) loadMembers();
  }, [isAdmin]);

  if (!isAdmin) {
    if (embedded) return null;
    return (
      <section className="admin-panel section-card admin-panel-locked">
        <p className="intel-sub">{t.adminOnlyHint}</p>
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

  const formatWhen = (iso) => {
    if (!iso) return t.neverLoggedIn;
    try {
      return new Date(iso).toLocaleString(locale === "ar" ? "ar-EG" : "en-GB");
    } catch {
      return "—";
    }
  };

  return (
    <section className={`admin-panel section-card${embedded ? " admin-panel-embedded" : ""}`}>
      {!embedded ? (
        <>
          <div className="section-label">
            <span className="section-label-icon">🛡️</span>
            <span>{t.adminPanelTitle}</span>
          </div>
        </>
      ) : null}

      <h3 className="intel-h3">{t.adminUsersTitle} ({members.length})</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t.fullName}</th>
              <th>{t.email}</th>
              <th>{t.roleCol}</th>
              <th>{t.lastLogin}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id}>
                <td>{m.full_name}</td>
                <td dir="ltr">{m.email}</td>
                <td>
                  <span className={`team-role-pill role-${m.role}`}>
                    {roleLabels[m.role] || m.role}
                  </span>
                </td>
                <td className="admin-when">{formatWhen(m.last_login_at)}</td>
                <td>
                  {m.role !== "owner" ? (
                    <button
                      type="button"
                      className="admin-remove-btn"
                      onClick={() => handleRemove(m)}
                    >
                      {t.removeMember}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!members.length && (
              <tr>
                <td colSpan={5} className="intel-empty">
                  {t.noTeamMembers}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
            type="password"
            placeholder={t.password}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
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

      <h3 className="intel-h3 admin-media-title">
        {t.adminMediaTitle} ({media.length})
      </h3>
      <div className="admin-media-grid">
        {media.map(({ url, items, primary }) => (
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
        ))}
        {!media.length && <p className="intel-empty">{t.noDetections}</p>}
      </div>

      <div className="admin-danger">
        <h3 className="ops-danger-title">{t.dangerZone}</h3>
        <p className="ops-danger-desc">{t.dangerZoneDesc}</p>
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
