import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "../components/LangToggle";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { fetchLeaderboard, fetchStats } from "../hooks/useApi";

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "R";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatDate(value, locale) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function ProfilePage({ logout }) {
  const { auth, updateProfile, changePassword } = useAuth();
  const { t, locale } = useLocale();
  const [fullName, setFullName] = useState(auth?.user?.full_name || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");
  const [pwForm, setPwForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [stats, setStats] = useState(null);
  const [myRank, setMyRank] = useState(null);

  useEffect(() => {
    setFullName(auth?.user?.full_name || "");
  }, [auth?.user?.full_name]);

  useEffect(() => {
    (async () => {
      try {
        const [statsData, board] = await Promise.all([fetchStats(), fetchLeaderboard(50)]);
        setStats(statsData);
        setMyRank(board.find((b) => b.user_id === auth?.user?.id) || null);
      } catch {
        setStats(null);
        setMyRank(null);
      }
    })();
  }, [auth?.user?.id]);

  const roleLabel = useMemo(() => {
    const role = auth?.user?.role;
    if (!role) return t.roleUnknown;
    return t[`role_${role}`] || role;
  }, [auth?.user?.role, t]);

  const lastLogin = formatDate(auth?.user?.last_login_at, locale);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg("");
    setProfileErr("");
    try {
      await updateProfile(fullName.trim());
      setProfileMsg(t.profileSaved);
    } catch (err) {
      setProfileErr(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwMsg("");
    setPwErr("");
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwErr(t.passwordMismatch);
      return;
    }
    setSavingPw(true);
    try {
      await changePassword(pwForm.current_password, pwForm.new_password);
      setPwMsg(t.passwordChanged);
      setPwForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      setPwErr(err.message);
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="page-profile">
      <section className="profile-hero-card">
        <div className="profile-hero-top">
          <div className="profile-avatar" aria-hidden>
            {initials(auth?.user?.full_name)}
          </div>
          <div className="profile-hero-text">
            <h2>{auth?.user?.full_name}</h2>
            <p className="profile-email">{auth?.user?.email}</p>
            <div className="profile-badges">
              <span className="profile-badge profile-badge-role">{roleLabel}</span>
              {auth?.organization?.name ? (
                <span className="profile-badge profile-badge-org">{auth.organization.name}</span>
              ) : null}
            </div>
          </div>
          <div className="profile-hero-mark">
            <BrandLogo size="md" variant="mark" />
          </div>
        </div>
        <div className="profile-meta-row">
          <span>
            <strong>{t.lastLogin}:</strong>{" "}
            {lastLogin || t.neverLoggedIn}
          </span>
          <span>
            <strong>{t.orgPlan}:</strong> {auth?.organization?.plan || "—"}
          </span>
        </div>
      </section>

      <div className="profile-grid">
        {myRank ? (
          <section className="profile-card profile-card-highlight">
            <h3>{t.profilePoints}</h3>
            <p className="profile-points-value">{myRank.points}</p>
            <p className="profile-points-rank">{myRank.rank_title}</p>
          </section>
        ) : null}

        {stats ? (
          <section className="profile-card">
            <h3>{t.profileActivity}</h3>
            <div className="profile-stats-row">
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.total_detections}</span>
                <span className="profile-stat-label">{t.statTotal}</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.verified_detections}</span>
                <span className="profile-stat-label">{t.statVerified}</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-value">{stats.critical_count || 0}</span>
                <span className="profile-stat-label">{t.sevCritical}</span>
              </div>
            </div>
          </section>
        ) : null}

        <section className="profile-card">
          <h3>{t.profileAccount}</h3>
          <p className="profile-card-sub">{t.profileAccountSub}</p>
          <form className="profile-form" onSubmit={saveProfile}>
            <label className="profile-label" htmlFor="profile-full-name">
              {t.fullName}
            </label>
            <input
              id="profile-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
            />
            <label className="profile-label">{t.email}</label>
            <input value={auth?.user?.email || ""} disabled className="profile-input-disabled" />
            {profileErr ? <p className="profile-error">{profileErr}</p> : null}
            {profileMsg ? <p className="profile-success">{profileMsg}</p> : null}
            <button type="submit" className="profile-btn profile-btn-primary" disabled={savingProfile}>
              {savingProfile ? "..." : t.saveProfile}
            </button>
          </form>
        </section>

        <section className="profile-card">
          <h3>{t.profileSecurity}</h3>
          <p className="profile-card-sub">{t.profileSecuritySub}</p>
          <form className="profile-form" onSubmit={savePassword}>
            <label className="profile-label" htmlFor="current-password">
              {t.currentPassword}
            </label>
            <PasswordInput
              id="current-password"
              value={pwForm.current_password}
              onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
              placeholder={t.currentPassword}
              required
              minLength={6}
              autoComplete="current-password"
            />
            <label className="profile-label" htmlFor="new-password">
              {t.newPassword}
            </label>
            <PasswordInput
              id="new-password"
              value={pwForm.new_password}
              onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
              placeholder={t.newPassword}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <label className="profile-label" htmlFor="confirm-password">
              {t.confirmPassword}
            </label>
            <PasswordInput
              id="confirm-password"
              value={pwForm.confirm_password}
              onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
              placeholder={t.confirmPassword}
              required
              minLength={6}
              autoComplete="new-password"
            />
            {pwErr ? <p className="profile-error">{pwErr}</p> : null}
            {pwMsg ? <p className="profile-success">{pwMsg}</p> : null}
            <button type="submit" className="profile-btn profile-btn-primary" disabled={savingPw}>
              {savingPw ? "..." : t.changePassword}
            </button>
          </form>
        </section>
      </div>

      <div className="profile-actions">
        <button type="button" className="profile-btn profile-btn-danger" onClick={logout}>
          {t.logout}
        </button>
      </div>
    </div>
  );
}
