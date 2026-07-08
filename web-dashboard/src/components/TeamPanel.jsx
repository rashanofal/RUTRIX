import { useEffect, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { fetchTeamMembers, inviteTeamMember } from "../hooks/useApi";

const ROLES = ["field", "admin", "viewer"];

export default function TeamPanel() {
  const { t } = useLocale();
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "field",
  });
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetchTeamMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await inviteTeamMember(form);
      setForm({ email: "", password: "", full_name: "", role: "field" });
      setShowForm(false);
      load();
    } catch {
      window.alert(t.inviteFail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="team-panel section-card">
      <div className="section-label">
        <span className="section-label-icon">👥</span>
        <span>{t.teamTitle}</span>
      </div>
      <ul className="team-list">
        {members.map((m) => (
          <li key={m.user_id} className="team-item">
            <span className="team-name">{m.full_name}</span>
            <span className="team-role">{m.role}</span>
          </li>
        ))}
      </ul>
      {!showForm ? (
        <button type="button" className="team-invite-btn" onClick={() => setShowForm(true)}>
          + {t.inviteMember}
        </button>
      ) : (
        <form className="team-form" onSubmit={submit}>
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
                {r}
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
    </section>
  );
}
