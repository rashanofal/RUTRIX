import LangToggle, { BrandLogo } from "./LangToggle";
import { useLocale } from "../context/LocaleContext";

import NavIcon from "./NavIcons";

const NAV = [
  { id: "overview", icon: "overview", labelKey: "navOverview" },
  { id: "map", icon: "map", labelKey: "navMap" },
  { id: "field", icon: "field", labelKey: "navField" },
  { id: "ops", icon: "ops", labelKey: "navOps" },
  { id: "intel", icon: "intel", labelKey: "navIntel" },
  { id: "mobile", icon: "mobile", labelKey: "navMobile" },
];

export default function AppShell({
  page,
  onNavigate,
  auth,
  logout,
  wsConnected,
  children,
}) {
  const { t } = useLocale();

  return (
    <div className="app-shell">
      <nav className="app-nav-rail" aria-label="Main navigation">
        <button
          type="button"
          className="nav-rail-brand"
          onClick={() => onNavigate("overview")}
          title={t.brand}
          aria-label={t.brand}
        >
          <BrandLogo size="sm" />
        </button>
        <div className="nav-rail-items">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-rail-btn ${page === item.id ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
              title={t[item.labelKey]}
              aria-current={page === item.id ? "page" : undefined}
            >
              <NavIcon name={item.icon} />
              <span className="nav-rail-label">{t[item.labelKey]}</span>
            </button>
          ))}
        </div>
        <div className="nav-rail-footer">
          <LangToggle className="lang-toggle-rail" />
        </div>
      </nav>

      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-brand">
            {page === "overview" ? (
              <div className="topbar-brand-stack">
                <h1 className="topbar-platform">{t.brand}</h1>
                <p className="topbar-scientific">{t.brandSub}</p>
                {t.tagline ? <p className="topbar-tagline">{t.tagline}</p> : null}
              </div>
            ) : (
              <div className="topbar-brand-text">
                <h1 className="topbar-platform">{t.brand}</h1>
                <span className="topbar-sep" aria-hidden>·</span>
                <span className="topbar-page">{t[`pageTitle_${page}`]}</span>
              </div>
            )}
          </div>
          <div className="topbar-end">
            {auth?.organization?.name && (
              <span className="topbar-org-pill">{auth.organization.name}</span>
            )}
            <span
              className={`topbar-live-pill ${wsConnected ? "on" : "off"}`}
              title={wsConnected ? t.liveSync : t.disconnected}
            >
              <span className={`topbar-live-dot ${wsConnected ? "on" : "off"}`} />
              {wsConnected ? t.liveSync : t.disconnected}
            </span>
            <button type="button" className="topbar-logout" onClick={logout}>
              {t.logout}
            </button>
          </div>
        </header>

        <main className="app-page">{children}</main>
      </div>
    </div>
  );
}
