import { useLocale } from "../context/LocaleContext";

export default function LangToggle({ className = "" }) {
  const { t, toggleLocale } = useLocale();
  return (
    <button type="button" className={`lang-toggle ${className}`} onClick={toggleLocale}>
      {t.langLabel}
    </button>
  );
}

/** Brand lockup — icon mark or horizontal wordmark */
export function BrandLogo({ size = "md", variant = "full", showName = true }) {
  const { t, locale } = useLocale();
  const v = "5";
  const markSrc = `/brand/logo-mark.png?v=${v}`;
  const fullSrc = `/brand/logo.png?v=${v}`;

  if (variant === "mark" || !showName) {
    return (
      <div className={`rutrix-logo rutrix-logo--${size} rutrix-logo--mark`} aria-hidden>
        <img className="rutrix-logo__img" src={markSrc} alt="" />
      </div>
    );
  }

  if (locale === "en") {
    return (
      <div className={`rutrix-logo rutrix-logo--${size} rutrix-logo--image`} aria-hidden>
        <img className="rutrix-logo__img rutrix-logo__full-img" src={fullSrc} alt={t.brand} />
      </div>
    );
  }

  return (
    <div className={`rutrix-logo rutrix-logo--${size} rutrix-logo--lockup`} aria-hidden>
      <img className="rutrix-logo__img rutrix-logo__mark" src={markSrc} alt="" />
      <span className="rutrix-logo__word">{t.brand}</span>
    </div>
  );
}
