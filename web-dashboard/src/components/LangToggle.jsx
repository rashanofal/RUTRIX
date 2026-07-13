import { useLocale } from "../context/LocaleContext";

export default function LangToggle({ className = "" }) {
  const { t, toggleLocale } = useLocale();
  return (
    <button type="button" className={`lang-toggle ${className}`} onClick={toggleLocale}>
      {t.langLabel}
    </button>
  );
}

/** Official RUTRIX lockup — horizontal logo image or icon mark only */
export function BrandLogo({ size = "md", variant = "full", showName = true }) {
  const { t } = useLocale();
  const v = "8";
  const markSrc = `/brand/logo-mark.png?v=${v}`;
  const fullSrc = `/brand/logo.png?v=${v}`;

  if (variant === "mark" || !showName) {
    return (
      <div className={`rutrix-logo rutrix-logo--${size} rutrix-logo--mark`} aria-hidden>
        <img className="rutrix-logo__img" src={markSrc} alt="" />
      </div>
    );
  }

  return (
    <div className={`rutrix-logo rutrix-logo--${size} rutrix-logo--image`} aria-hidden>
      <img className="rutrix-logo__img rutrix-logo__full-img" src={fullSrc} alt={t.brand} />
    </div>
  );
}
