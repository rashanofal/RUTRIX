import { useLocale } from "../context/LocaleContext";

const TABS = [
  { id: "field", icon: "📍", labelKey: "tabField" },
  { id: "ops", icon: "🏛️", labelKey: "tabOps" },
  { id: "intel", icon: "🧠", labelKey: "tabIntel" },
  { id: "mobile", icon: "📱", labelKey: "tabMobile" },
];

export default function SidebarTabs({ active, onChange }) {
  const { t } = useLocale();

  return (
    <nav className="sidebar-tabs" aria-label="Dashboard sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`sidebar-tab ${active === tab.id ? "active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="sidebar-tab-icon">{tab.icon}</span>
          <span className="sidebar-tab-label">{t[tab.labelKey]}</span>
        </button>
      ))}
    </nav>
  );
}
