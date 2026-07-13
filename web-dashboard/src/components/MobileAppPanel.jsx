import { useEffect, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import NavIcon from "./NavIcons";
import QrCodeBlock from "./QrCodeBlock";

export default function MobileAppPanel({ compact = false }) {
  const { t } = useLocale();
  const [phoneUrl, setPhoneUrl] = useState("");
  const [httpsUrl, setHttpsUrl] = useState("");

  useEffect(() => {
    fetch("/api/network")
      .then((r) => r.json())
      .then((d) => {
        if (d.mobile_http) setPhoneUrl(d.mobile_http);
        if (d.mobile_https) setHttpsUrl(d.mobile_https);
      })
      .catch(() => {});
  }, []);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      window.alert(t.copyOk);
    } catch {
      window.prompt(t.copyManual, text);
    }
  };

  return (
    <div className={`mobile-app-panel ${compact ? "compact" : ""}`}>
      {!compact ? (
        <div className="mobile-app-head">
          <span className="mobile-app-head-icon" aria-hidden>
            <NavIcon name="mobile" />
          </span>
          <h2 className="mobile-app-head-title">{t.mobileAppTitle}</h2>
        </div>
      ) : null}

      <div className="mobile-platform-grid">
        <article className="mobile-platform-card android">
          <header className="platform-head">
            <span className="platform-icon platform-icon-svg" aria-hidden>
              <NavIcon name="mobile" />
            </span>
            <h3>{t.androidTitle}</h3>
          </header>

          <QrCodeBlock
            url={phoneUrl}
            label={t.scanQrAndroid}
            variant="highlight"
            onCopy={copy}
            copyLabel={t.copy}
            loadingText={t.loading}
          />
        </article>

        <article className="mobile-platform-card iphone">
          <header className="platform-head">
            <span className="platform-icon platform-icon-svg" aria-hidden>
              <NavIcon name="mobile" />
            </span>
            <h3>{t.iphoneTitle}</h3>
          </header>

          <QrCodeBlock
            url={httpsUrl}
            label={t.scanQrIphone}
            variant="https"
            onCopy={copy}
            copyLabel={t.copy}
            loadingText={t.loading}
          />
        </article>
      </div>
    </div>
  );
}
