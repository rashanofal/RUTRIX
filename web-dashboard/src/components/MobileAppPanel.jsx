import { useEffect, useMemo, useState } from "react";
import { APP_DISTRIBUTION } from "../brand";
import { useLocale } from "../context/LocaleContext";
import NavIcon from "./NavIcons";
import QrCodeBlock from "./QrCodeBlock";

function resolvePublicMobileUrl() {
  if (typeof window === "undefined") return "";
  const path = APP_DISTRIBUTION.publicMobilePath || "/mobile";
  const base = `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
  return `${base}?lang=en&mode=login`;
}

function isLocalHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    /^192\.168\./.test(h) ||
    /^10\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

export default function MobileAppPanel({ compact = false }) {
  const { t } = useLocale();
  const publicUrl = useMemo(() => resolvePublicMobileUrl(), []);
  const [copied, setCopied] = useState(false);
  const [lanHttp, setLanHttp] = useState("");
  const [lanHttps, setLanHttps] = useState("");
  const local = isLocalHost();

  useEffect(() => {
    if (!local) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    fetch("/api/network", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        if (d.mobile_http) setLanHttp(d.mobile_http);
        if (d.mobile_https) setLanHttps(d.mobile_https);
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [local]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt(t.copyManual, text);
    }
  };

  const openUrl = (url) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const playUrl = APP_DISTRIBUTION.playStoreUrl;
  const appStoreUrl = APP_DISTRIBUTION.appStoreUrl;

  return (
    <div className={`mobile-app-panel ${compact ? "compact" : ""}`}>
      {!compact ? (
        <div className="mobile-app-head">
          <span className="mobile-app-head-icon" aria-hidden>
            <NavIcon name="mobile" />
          </span>
          <div>
            <h2 className="mobile-app-head-title">{t.mobileAppTitle}</h2>
            <p className="mobile-app-head-sub">{t.mobileAppSub}</p>
          </div>
          <span className="mobile-beta-badge">{t.mobileBetaBadge}</span>
        </div>
      ) : null}

      <section className="mobile-beta-card" aria-label={t.mobileWebBetaTitle}>
        <header className="mobile-beta-card-head">
          <h3>{t.mobileWebBetaTitle}</h3>
          <p>{t.mobileWebBetaSub}</p>
        </header>

        <QrCodeBlock
          url={publicUrl}
          label={t.mobileScanQr}
          variant="highlight"
          note={t.mobileQrNote}
          onCopy={copy}
          copyLabel={copied ? t.copyOk : t.copy}
          loadingText={t.loading}
        />

        <div className="mobile-beta-actions">
          <button type="button" className="mobile-action-btn primary" onClick={() => openUrl(publicUrl)}>
            {t.mobileOpenApp}
          </button>
          <button type="button" className="mobile-action-btn" onClick={() => copy(publicUrl)}>
            {copied ? t.copyOk : t.mobileCopyLink}
          </button>
        </div>

        <ol className="mobile-beta-steps">
          {(t.mobileBetaSteps || []).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="mobile-stores" aria-label={t.mobileStoresTitle}>
        <h3 className="mobile-stores-title">{t.mobileStoresTitle}</h3>
        <p className="mobile-stores-sub">{t.mobileStoresSub}</p>
        <div className="mobile-store-grid">
          <article className={`mobile-store-card${playUrl ? "" : " soon"}`}>
            <span className="mobile-store-icon" aria-hidden>
              ▶
            </span>
            <div>
              <strong>{t.androidTitle}</strong>
              <span>{t.googlePlay}</span>
            </div>
            {playUrl ? (
              <a className="mobile-store-btn" href={playUrl} target="_blank" rel="noreferrer">
                {t.openStore}
              </a>
            ) : (
              <span className="mobile-store-soon">{t.comingSoon}</span>
            )}
          </article>
          <article className={`mobile-store-card${appStoreUrl ? "" : " soon"}`}>
            <span className="mobile-store-icon" aria-hidden>
              ⌘
            </span>
            <div>
              <strong>{t.iphoneTitle}</strong>
              <span>{t.appleStore}</span>
            </div>
            {appStoreUrl ? (
              <a className="mobile-store-btn" href={appStoreUrl} target="_blank" rel="noreferrer">
                {t.openStore}
              </a>
            ) : (
              <span className="mobile-store-soon">{t.comingSoon}</span>
            )}
          </article>
        </div>
      </section>

      {local ? (
        <details className="mobile-lan-details">
          <summary>{t.mobileLanTitle}</summary>
          <p className="mobile-lan-hint">{t.mobileLanHint}</p>
          <div className="mobile-platform-grid">
            <QrCodeBlock
              url={lanHttp}
              label={t.scanQrAndroid}
              variant="default"
              onCopy={copy}
              copyLabel={t.copy}
              loadingText={t.loading}
            />
            <QrCodeBlock
              url={lanHttps}
              label={t.scanQrIphone}
              variant="https"
              onCopy={copy}
              copyLabel={t.copy}
              loadingText={t.loading}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
