import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import LangToggle, { BrandLogo } from "./LangToggle";

export default function LoginPage() {
  const { login, register } = useAuth();
  const { t } = useLocale();
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "demo@pothole.app",
    password: "demo1234",
    full_name: "",
    organization_name: "",
  });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register(form);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-hero">
        <BrandLogo size="lg" />
        <h1>{t.brand}</h1>
        <p className="scientific-name">{t.brandSub}</p>
        {t.tagline ? <p className="tagline">{t.tagline}</p> : null}
        <ul className="feature-list">
          {t.features.map((f) => (
            <li key={f.text}>
              <span className="feature-icon">{f.icon}</span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <div className="login-card-head">
            <div>
              <h2>{mode === "login" ? t.login : t.register}</h2>
              <p className="login-sub">
                {mode === "login" ? t.loginSub : t.registerSub}
              </p>
            </div>
            <LangToggle />
          </div>

          <form onSubmit={submit} className="login-form">
            {mode === "register" && (
              <>
                <input
                  placeholder={t.fullName}
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                />
                <input
                  placeholder={t.orgName}
                  value={form.organization_name}
                  onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
                  required
                />
              </>
            )}
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
              minLength={6}
            />
            {error && <p className="login-error">{error}</p>}
            <button type="submit" disabled={loading} className="login-btn">
              {loading
                ? "..."
                : mode === "login"
                  ? t.submitLogin
                  : t.submitRegister}
            </button>
          </form>

          <button
            type="button"
            className="login-toggle"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? t.toggleRegister : t.toggleLogin}
          </button>

          <p className="login-demo">{t.demo}</p>
        </div>
      </div>
    </div>
  );
}
