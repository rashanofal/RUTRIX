import { QRCodeSVG } from "qrcode.react";

export default function QrCodeBlock({ url, label, note, variant = "default", onCopy, copyLabel, loadingText }) {
  return (
    <div className={`mobile-qr-block ${variant}`}>
      {label && <span className="mobile-qr-label">{label}</span>}
      <div className="mobile-qr-frame">
        {url ? (
          <QRCodeSVG
            value={url}
            size={200}
            level="M"
            includeMargin
            bgColor="#ffffff"
            fgColor="#0b1120"
          />
        ) : (
          <div className="mobile-qr-placeholder">{loadingText || "…"}</div>
        )}
      </div>
      {url && <p className="mobile-qr-url">{url}</p>}
      {note && <p className="mobile-qr-note">{note}</p>}
      {url && onCopy && (
        <button type="button" className="mobile-copy-btn mobile-qr-copy" onClick={() => onCopy(url)}>
          {copyLabel}
        </button>
      )}
    </div>
  );
}
