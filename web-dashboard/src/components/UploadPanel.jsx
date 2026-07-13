import { useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { apiFetch } from "../hooks/useApi";
import NavIcon from "./NavIcons";

async function readResponseBody(res) {
  const raw = await res.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

function getDeviceCoords() {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export default function UploadPanel({ onUploaded }) {
  const { t } = useLocale();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(t.uploading);
    setMessageType("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("device_type", "mms");

      const coords = await getDeviceCoords();
      if (coords?.latitude != null && coords?.longitude != null) {
        formData.append("latitude", String(coords.latitude));
        formData.append("longitude", String(coords.longitude));
      }

      const res = await apiFetch("/api/detections/upload", {
        method: "POST",
        body: formData,
      });

      const data = await readResponseBody(res);

      if (!res.ok) {
        const detail =
          (typeof data?.detail === "string" && data.detail) ||
          (data?.detail ? JSON.stringify(data.detail) : null) ||
          data?.message ||
          (res.status === 500 ? t.uploadServerOld : null) ||
          `HTTP ${res.status}`;
        throw new Error(detail);
      }

      setMessage(data?.message || t.uploadOk);
      setMessageType("ok");
      onUploaded?.(data);    } catch (err) {
      setMessage(err?.message || t.uploadFail);
      setMessageType("err");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  return (
    <section className="upload-panel">
      <div className="section-label">
        <span className="section-label-icon"><NavIcon name="signal" /></span>
        <span>{t.uploadTitle}</span>
      </div>
      <p className="upload-hint">{t.uploadHint}</p>

      <div className="upload-zone">
        <label className={`upload-btn ${loading ? "disabled" : ""}`}>
          <span className="upload-btn-icon">
            <NavIcon name={loading ? "recent" : "field"} />
          </span>
          <span>{loading ? t.uploading : t.uploadBtn}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleUpload}
            disabled={loading}
            hidden
          />
        </label>
      </div>

      {message && (
        <p className={`upload-msg ${messageType}`}>{message}</p>
      )}
    </section>
  );
}
