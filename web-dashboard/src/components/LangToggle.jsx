import { useLocale } from "../context/LocaleContext";
import RutrixMarkIcon from "./RutrixMarkIcon";

export default function LangToggle({ className = "" }) {
  const { t, toggleLocale } = useLocale();
  return (
    <button type="button" className={`lang-toggle ${className}`} onClick={toggleLocale}>
      {t.langLabel}
    </button>
  );
}

/** Official RUTRIX lockup — mark + word, horizontal image, or icon only */
export function BrandLogo({ size = "md", variant = "full", showName = true }) {
  const { t } = useLocale();
  const v = "12";
  const markSrc = `/brand/logo-mark.png?v=${v}`;
  const fullSrc = `/brand/logo.png?v=${v}`;

  if (variant === "lockup") {
    return (
      <div className={`rutrix-logo rutrix-logo--${size} rutrix-logo--lockup rutrix-logo--lockup-stack`} aria-hidden>
        <RutrixMarkIcon />
        <span className="rutrix-logo__word">{t.brand}</span>
      </div>
    );
  }

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
