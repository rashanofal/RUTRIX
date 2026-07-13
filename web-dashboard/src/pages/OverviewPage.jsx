import { useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { BrandLogo } from "../components/LangToggle";
import NavIcon from "../components/NavIcons";

const QUICK_LINKS = [
  { page: "map", icon: "map", labelKey: "navMap", descKey: "quickMapDesc" },
  { page: "field", icon: "upload", labelKey: "navField", descKey: "quickFieldDesc" },
  { page: "ops", icon: "ops", labelKey: "navOps", descKey: "quickOpsDesc" },
  { page: "intel", icon: "chart", labelKey: "navIntel", descKey: "quickIntelDesc" },
  { page: "mobile", icon: "mobile", labelKey: "navMobile", descKey: "pageSub_mobile" },
];

export default function OverviewPage({ detections, onNavigate }) {
  const { t, locale } = useLocale();
  const [heroOk, setHeroOk] = useState(true);
  const pinned = detections.filter((d) => d.latitude != null).length;
  const heroSrc = locale === "en" ? "/brand/hero-en.png?v=4" : "/brand/hero-ar.png?v=4";

  return (
    <div className="page-overview page-overview-home">
      <section className="overview-banner overview-banner-full">
        {heroOk ? (
          <img
            src={heroSrc}
            alt={t.brand}
            className="overview-banner-image"
            onError={() => setHeroOk(false)}
          />
        ) : (
          <div className="overview-banner-fallback">
            <BrandLogo size="lg" variant="full" />
          </div>
        )}
      </section>

      <div className="page-hero page-hero-compact">
        <div className="page-hero-text">
          <h2>{t.overviewWelcome}</h2>
          {t.overviewWelcomeSub ? <p>{t.overviewWelcomeSub}</p> : null}
        </div>
        <div className="page-hero-badges">
          <span className="hero-badge">
            <NavIcon name="map" /> {pinned} {pinned === 1 ? t.mapPins : t.mapPinsPlural}
          </span>
        </div>
      </div>

      <section className="overview-card overview-home-nav">
        <h3 className="overview-card-title">{t.quickActions}</h3>
        <div className="quick-links quick-links-home">
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
    </div>
  );
}
