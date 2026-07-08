import { useEffect, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import QrCodeBlock from "./QrCodeBlock";

export default function MobileAppPanel({ compact = false }) {
  const { t } = useLocale();
  const [phoneUrl, setPhoneUrl] = useState("");
  const [httpsUrl, setHttpsUrl] = useState("");
  const [lanIp, setLanIp] = useState("");
  const pcUrl = "http://localhost:8000/mobile";

  useEffect(() => {
    fetch("/api/network")
      .then((r) => r.json())
      .then((d) => {
        if (d.mobile_http) setPhoneUrl(d.mobile_http);
        if (d.mobile_https) setHttpsUrl(d.mobile_https);
        if (d.lan_ip) setLanIp(d.lan_ip);
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
      {!compact && (
        <>
          <div className="section-label">
            <span className="section-label-icon">📱</span>
            <span>{t.mobileAppTitle}</span>
          </div>
          <p className="mobile-app-hint">{t.mobileAppHint}</p>
        </>
      )}

      <div className="mobile-platform-card android">
        <div className="platform-head">
          <span className="platform-icon">🤖</span>
          <div>
            <h3>{t.androidTitle}</h3>
            <p>{t.androidSub}</p>
          </div>
        </div>

        <QrCodeBlock
          url={phoneUrl}
          label={t.scanQrAndroid}
          variant="highlight"
          onCopy={copy}
          copyLabel={t.copy}
          loadingText={t.loading}
        />

        <ul className="platform-steps-short">
          <li>{t.mobileStep1}</li>
          <li>{t.mobileStep2}</li>
          <li>{t.mobileStepLogin}</li>
        </ul>
      </div>

      <div className="mobile-platform-card iphone">
        <div className="platform-head">
          <span className="platform-icon">🍎</span>
          <div>
            <h3>{t.iphoneTitle}</h3>
            <p>{t.iphoneSub}</p>
          </div>
        </div>

        <QrCodeBlock
          url={httpsUrl}
          label={t.scanQrIphone}
          variant="https"
          onCopy={copy}
          copyLabel={t.copy}
          loadingText={t.loading}
        />
      </div>

      <div className="mobile-pc-row">
        <span className="mobile-url-label">{t.mobileOnPc}</span>
        <a className="mobile-pc-link" href={pcUrl} target="_blank" rel="noreferrer">
          {pcUrl}
        </a>
      </div>

      <details className="mobile-expo-details">
        <summary>{t.mobileExpoTitle}</summary>
        <pre className="mobile-expo-code">{`cd mobile\nnpx expo start\n\n# Android APK:\n# بناء_التطبيق.bat`}</pre>
        <p className="mobile-url-note">{t.mobileExpoHint}</p>
        {lanIp && (
          <p className="mobile-url-note">
            Expo LAN: exp://{lanIp}:8081
          </p>
        )}
      </details>
    </div>
  );
}
