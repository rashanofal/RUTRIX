import LangToggle, { BrandLogo } from "./LangToggle";
import { useLocale } from "../context/LocaleContext";

import NavIcon from "./NavIcons";

const NAV = [
  { id: "overview", icon: "overview", labelKey: "navOverview" },
  { id: "map", icon: "map", labelKey: "navMap" },
  { id: "field", icon: "field", labelKey: "navField" },
  { id: "ops", icon: "ops", labelKey: "navOps" },
  { id: "supervisor", icon: "supervisor", labelKey: "navSupervisor", adminOnly: true },
  { id: "intel", icon: "intel", labelKey: "navIntel" },
  { id: "mobile", icon: "mobile", labelKey: "navMobile" },
  { id: "profile", icon: "profile", labelKey: "navProfile" },
];

export default function AppShell({
  page,
  onNavigate,
  auth,
  logout,
  wsConnected,
  isAdmin,
  children,
}) {
  const { t } = useLocale();
  const navItems = NAV.filter((item) => !item.adminOnly || isAdmin);

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
          <BrandLogo size="sm" variant="mark" />
        </button>
        <div className="nav-rail-items">
          {navItems.map((item) => (
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
        <header className={`app-topbar${page === "map" || page === "supervisor" ? " app-topbar-map-compact" : ""}`}>
          <div className="topbar-brand">
            {page === "overview" ? (
              <div className="topbar-brand-stack">
                <p className="topbar-scientific">{t.brandSub}</p>
                {t.tagline ? <p className="topbar-tagline">{t.tagline}</p> : null}
              </div>
            ) : (
              <div className="topbar-brand-text">
                <h1 className="topbar-platform">{t[`pageTitle_${page}`]}</h1>
              </div>
            )}
          </div>
          <div className="topbar-end">
            <LangToggle className="lang-toggle-topbar" />
            <button
              type="button"
              className="topbar-user-chip"
              onClick={() => onNavigate("profile")}
              title={t.navProfile}
            >
              <span className="topbar-user-avatar" aria-hidden>
                {(auth?.user?.full_name || "?")
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")
                  .toUpperCase() || "R"}
              </span>
              <span className="topbar-user-name">{auth?.user?.full_name}</span>
            </button>
            {auth?.organization?.name && (
              <span className="topbar-org-pill">{auth.organization.name}</span>
            )}
            <span
              className={`topbar-live-pill ${wsConnected ? "on" : "off"}`}
              title={wsConnected ? t.liveSync : t.disconnected}
            >
              <span className={`topbar-live-dot ${wsConnected ? "on" : "off"}`} />
              <span className="topbar-live-label">
                {wsConnected ? t.liveSync : t.disconnected}
              </span>
            </span>
            <button type="button" className="topbar-logout" onClick={logout}>
              {t.logout}
            </button>
          </div>
        </header>

        <main className={`app-page${page === "map" || page === "supervisor" ? " app-page-map" : ""}`}>{children}</main>
        {page !== "map" && page !== "supervisor" ? (
          <footer className="app-footer">
            <p className="app-footer-credit">{t.creator}</p>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
