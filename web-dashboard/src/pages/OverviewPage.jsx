import { useLocale } from "../context/LocaleContext";
import StatsGrid from "../components/StatsGrid";
import DetectionList from "../components/DetectionList";

import NavIcon from "../components/NavIcons";

const QUICK_LINKS = [
  { page: "map", icon: "map", labelKey: "navMap", descKey: "quickMapDesc" },
  { page: "field", icon: "upload", labelKey: "navField", descKey: "quickFieldDesc" },
  { page: "ops", icon: "ops", labelKey: "navOps", descKey: "quickOpsDesc" },
  { page: "intel", icon: "chart", labelKey: "navIntel", descKey: "quickIntelDesc" },
];

export default function OverviewPage({ stats, detections, selectedId, onSelect, onNavigate }) {
  const { t } = useLocale();
  const recent = detections.slice(0, 6);
  const pinned = detections.filter((d) => d.latitude != null).length;

  return (
    <div className="page-overview">
      <div className="page-hero">
        <div className="page-hero-text">
          <h2>{t.overviewWelcome}</h2>
        </div>
        <div className="page-hero-badges">
          <span className="hero-badge">
            <NavIcon name="map" /> {pinned} {pinned === 1 ? t.mapPins : t.mapPinsPlural}
          </span>
        </div>
      </div>

      <StatsGrid stats={stats} variant="hero" />

      <div className="overview-grid">
        <section className="overview-card">
          <h3 className="overview-card-title">{t.quickActions}</h3>
          <div className="quick-links">
            {QUICK_LINKS.map((link) => (
              <button
                key={link.page}
                type="button"
                className="quick-link-btn"
                onClick={() => onNavigate(link.page)}
              >
                <span className="quick-link-icon-wrap">
                  <NavIcon name={link.icon} />
                </span>
                <span className="quick-link-text">
                  <strong>{t[link.labelKey]}</strong>
                  <span>{t[link.descKey]}</span>
                </span>
                <span className="quick-link-arrow">←</span>
              </button>
            ))}
          </div>
        </section>

        <section className="overview-card">
          <div className="overview-card-head">
            <h3 className="overview-card-title">{t.recent}</h3>
            <button type="button" className="text-link-btn" onClick={() => onNavigate("field")}>
              {t.viewAll}
            </button>
          </div>
          <DetectionList
            detections={recent}
            selectedId={selectedId}
            onSelect={(id) => {
              onSelect(id);
              onNavigate("field");
            }}
            compact
            hideHeader
          />
        </section>
      </div>
    </div>
  );
}
