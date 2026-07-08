import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { translations } from "../i18n/translations";

const LocaleContext = createContext(null);
const STORAGE_KEY = "rutrix_locale";

export function LocaleProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "ar";
    } catch {
      return "ar";
    }
  });

  const t = translations[locale] || translations.ar;

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = t.dir;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* ignore */
    }
  }, [locale, t.dir]);

  const toggleLocale = () => setLocale((l) => (l === "ar" ? "en" : "ar"));

  const value = useMemo(
    () => ({ locale, setLocale, toggleLocale, t }),
    [locale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
