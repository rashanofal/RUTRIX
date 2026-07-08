import { useLocale } from "../context/LocaleContext";

export default function LangToggle({ className = "" }) {
  const { t, toggleLocale } = useLocale();
  return (
    <button type="button" className={`lang-toggle ${className}`} onClick={toggleLocale}>
      {t.langLabel}
    </button>
  );
}

/** Full brand lockup: stylized R + RUTRIX wordmark */
export function BrandLogo({ size = "md" }) {
  return (
    <div className={`rutrix-logo rutrix-logo--${size}`} aria-hidden>
      <img className="rutrix-logo__img" src="/brand/logo.png?v=6" alt="" />
    </div>
  );
}
