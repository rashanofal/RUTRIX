import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import LangToggle from "./LangToggle";

function initialAuthMode() {
  try {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    if (mode === "login" || mode === "register") return mode;
    if (params.has("login")) return "login";
    if (params.has("register")) return "register";
  } catch {
    /* ignore */
  }
  return "register";
}

export default function LoginPage() {
  const { login, register } = useAuth();
  const { t, locale } = useLocale();
  const startMode = initialAuthMode();
  const [mode, setMode] = useState(startMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: startMode === "login" ? "demo@pothole.app" : "",
    password: startMode === "login" ? "demo1234" : "",
    full_name: "",
    organization_name: "",
  });

  const heroSrc = locale === "en" ? "/brand/hero-en.png" : "/brand/hero-ar.png";

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
      <div className="login-hero login-hero-visual">
        <img
          src={heroSrc}
          alt={t.brand}
          className="login-hero-image"
          key={heroSrc}
        />
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
            onClick={() => {
              const next = mode === "login" ? "register" : "login";
              setMode(next);
              setError("");
              setForm((prev) => ({
                ...prev,
                email: next === "login" && !prev.email ? "demo@pothole.app" : prev.email,
                password: next === "login" && !prev.password ? "demo1234" : prev.password,
              }));
            }}
          >
            {mode === "login" ? t.toggleRegister : t.toggleLogin}
          </button>

          <p className="login-demo">{t.demo}</p>
        </div>
      </div>
      <footer className="login-footer">
        <p className="app-footer-credit">{t.creator}</p>
      </footer>
    </div>
  );
}
