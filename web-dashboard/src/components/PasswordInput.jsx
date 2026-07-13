import { useState } from "react";
import { useLocale } from "../context/LocaleContext";

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M3 3l18 18" />
        <path d="M10.58 10.58A2 2 0 0 0 12 15a2 2 0 0 0 1.42-.58" />
        <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 8-1.02 2.79-2.86 5.05-5.14 6.36" />
        <path d="M6.61 6.61C4.08 7.99 2.28 10.4 1 13a11.05 11.05 0 0 0 5.17 5.17" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function PasswordInput({
  value,
  onChange,
  placeholder,
  required = false,
  minLength,
  id,
  className = "",
  autoComplete,
}) {
  const { t } = useLocale();
  const [show, setShow] = useState(false);

  return (
    <div className={`password-field ${className}`.trim()}>
      <input
        id={id}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? t.hidePassword : t.showPassword}
        title={show ? t.hidePassword : t.showPassword}
      >
        <EyeIcon open={show} />
      </button>
    </div>
  );
}
