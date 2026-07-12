import { useLocale } from "../context/LocaleContext";

export default function LangToggle({ className = "" }) {
  const { t, toggleLocale } = useLocale();
  return (
    <button type="button" className={`lang-toggle ${className}`} onClick={toggleLocale}>
      {t.langLabel}
    </button>
  );
}

/** Brand lockup — full wordmark or icon-only mark for narrow nav rail */
export function BrandLogo({ size = "md", variant = "full" }) {
  const isMark = variant === "mark";
  const src = isMark ? "/brand/logo-mark.png?v=1" : "/brand/logo.png?v=9";
  return (
    <div
      className={`rutrix-logo rutrix-logo--${size}${isMark ? " rutrix-logo--mark" : ""}`}
      aria-hidden
    >
      <img className="rutrix-logo__img" src={src} alt="" />
    </div>
  );
}
