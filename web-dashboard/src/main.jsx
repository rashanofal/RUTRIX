import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { LocaleProvider } from "./context/LocaleContext";
import "./index.css";
import "./styles/rutrix-ui.css";

/** Phones opening the dashboard URL are sent to the field mobile app. */
function maybeRedirectPhonesToMobile() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("dashboard") === "1" || params.get("stay") === "dashboard") return;
    const path = window.location.pathname || "/";
    if (path !== "/" && path !== "/index.html") return;
    const ua = navigator.userAgent || "";
    const isPhone = /iPhone|iPod|Android.+Mobile|Windows Phone|Mobile/i.test(ua)
      && !/iPad|Tablet/i.test(ua);
    if (!isPhone) return;
    const lang = params.get("lang") || "en";
    const mode = params.get("mode") || "login";
    window.location.replace(`/mobile?lang=${encodeURIComponent(lang)}&mode=${encodeURIComponent(mode)}`);
  } catch {
    /* ignore */
  }
}

maybeRedirectPhonesToMobile();

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <LocaleProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LocaleProvider>
  </ErrorBoundary>
);