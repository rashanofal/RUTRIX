import { useLocale } from "../context/LocaleContext";

export default function LangToggle({ className = "" }) {
  const { t, toggleLocale } = useLocale();
  return (
    <button type="button" className={`lang-toggle ${className}`} onClick={toggleLocale}>
      {t.langLabel}
    </button>
  );
}

/**
 * size "sm" = icon mark only (nav rail)
 * size "md"/"lg" = full lockup R + RUTRIX
 */
export function BrandLogo({ size = "md" }) {
  const src =
    size === "sm" ? "/brand/logo-mark.png?v=4" : "/brand/logo.png?v=4";
  return (
    <div className={`rutrix-logo rutrix-logo--${size}`} aria-hidden>
      <img className="rutrix-logo__img" src={src} alt="" />
    </div>
  );
}
