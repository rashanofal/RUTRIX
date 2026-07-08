import { useLocale } from "../context/LocaleContext";



export default function LangToggle({ className = "" }) {

  const { t, toggleLocale } = useLocale();

  return (

    <button type="button" className={`lang-toggle ${className}`} onClick={toggleLocale}>

      {t.langLabel}

    </button>

  );

}



export function BrandLogo({ size = "md" }) {

  return (

    <div className={`rutrix-logo rutrix-logo--${size}`} aria-hidden>

      <span className="rutrix-logo__ring" />

      <span className="rutrix-logo__hex">R</span>

    </div>

  );

}


