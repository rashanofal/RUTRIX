import { useLocale } from "../context/LocaleContext";

export default function LangToggle({ className = "" }) {
  const { t, toggleLocale } = useLocale();
  return (
    <button type="button" className={`lang-toggle ${className}`} onClick={toggleLocale}>
      {t.langLabel}
    </button>
  );
}

/** Brand lockup — icon mark + localized wordmark (reliable on all devices) */
export function BrandLogo({ size = "md", variant = "full", showName = true }) {
  const { t } = useLocale();
  const isMark = variant === "mark";
  const src = "/brand/logo-mark.png?v=3";
  if (isMark || !showName) {
    return (
      <div
        className={`rutrix-logo rutrix-logo--${size} rutrix-logo--mark`}
        aria-hidden
      >
        <img className="rutrix-logo__img" src={src} alt="" />
      </div>
    );
  }
  return (
    <div className={`rutrix-logo rutrix-logo--${size} rutrix-logo--lockup`} aria-hidden>
      <img className="rutrix-logo__img rutrix-logo__mark" src={src} alt="" />
      <span className="rutrix-logo__word">{t.brand}</span>
    </div>
  );
}
