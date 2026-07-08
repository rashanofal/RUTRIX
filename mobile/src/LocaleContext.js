import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { translations } from "./i18n";

const LocaleContext = createContext(null);
const KEY = "rutrix_locale_v2";

export function LocaleProvider({ children }) {
  const [locale, setLocale] = useState("en");

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === "en" || v === "ar") setLocale(v);
    });
  }, []);

  const toggleLocale = async () => {
    const next = locale === "ar" ? "en" : "ar";
    setLocale(next);
    await AsyncStorage.setItem(KEY, next);
  };

  const t = translations[locale] || translations.en;
  const value = useMemo(() => ({ locale, t, toggleLocale }), [locale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale");
  return ctx;
}
