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

const SOURCES = [
  { id: "mms", labelKey: "deviceMms", hintKey: "sourceHintMms" },
  { id: "drone", labelKey: "deviceDrone", hintKey: "sourceHintDrone" },
  { id: "phone", labelKey: "devicePhone", hintKey: "sourceHintPhone" },
];

export default function UploadPanel({ onUploaded }) {
  const { t } = useLocale();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [deviceType, setDeviceType] = useState("mms");
  const [missionId, setMissionId] = useState("");
  const [frameInterval, setFrameInterval] = useState("1");
  const [usePathGps, setUsePathGps] = useState(false);
  const [startLat, setStartLat] = useState("");
  const [startLon, setStartLon] = useState("");
  const [endLat, setEndLat] = useState("");
  const [endLon, setEndLon] = useState("");
  const [progress, setProgress] = useState("");

  const sourceHint = SOURCES.find((s) => s.id === deviceType);

  const appendGpsFields = (formData) => {
    if (!usePathGps) return;
    if (startLat !== "" && startLon !== "") {
      formData.append("latitude", String(Number(startLat)));
      formData.append("longitude", String(Number(startLon)));
    }
    if (endLat !== "" && endLon !== "") {
      formData.append("end_latitude", String(Number(endLat)));
      formData.append("end_longitude", String(Number(endLon)));
    }
  };

  const handleUpload = async (e) => {
    const list = Array.from(e.target.files || []);
    if (!list.length) return;

    setLoading(true);
    setMessage(t.uploading);
    setMessageType("");
    setProgress("");

    try {
      const hasVideo = list.some((f) => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f.name));
      const isBatch = list.length > 1 || hasVideo;

      if (isBatch) {
        const formData = new FormData();
        list.forEach((f) => formData.append("files", f));
        formData.append("device_type", deviceType);
        if (missionId.trim()) formData.append("mission_id", missionId.trim());
        formData.append("frame_interval_sec", String(Number(frameInterval) || 1));
        appendGpsFields(formData);

        if (!usePathGps) {
          // Live browser GPS is only a fallback; EXIF on photos wins on the server.
          const coords = await getDeviceCoords();
          if (coords?.latitude != null && coords?.longitude != null) {
            formData.append("latitude", String(coords.latitude));
            formData.append("longitude", String(coords.longitude));
          }
        }

        setProgress(
          hasVideo
            ? t.batchProgressVideo
            : t.batchProgressImages.replace("{n}", String(list.length))
        );

        const res = await apiFetch("/api/detections/upload-batch", {
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
        setMessage(data?.message || t.batchOk);
        setMessageType("ok");
        onUploaded?.(data);
      } else {
        const file = list[0];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("device_type", deviceType);
        if (missionId.trim()) formData.append("source_id", missionId.trim());
        appendGpsFields(formData);

        // Single file: skip live GPS so phone-album EXIF pins the real place
        if (usePathGps) {
          /* path GPS already on form */
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
        onUploaded?.(data);
      }
    } catch (err) {
      setMessage(err?.message || t.uploadFail);
      setMessageType("err");
    } finally {
      setLoading(false);
      setProgress("");
      e.target.value = "";
    }
  };

  return (
    <section className="upload-panel">
      <div className="section-label">
        <span className="section-label-icon"><NavIcon name="signal" /></span>
        <span>{t.uploadTitle}</span>
      </div>
      <p className="upload-hint">{t.uploadHintBatch}</p>

      <div className="upload-source-row" role="group" aria-label={t.uploadSource}>
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`upload-source-btn ${deviceType === s.id ? "active" : ""}`}
            disabled={loading}
            onClick={() => setDeviceType(s.id)}
          >
            {t[s.labelKey]}
          </button>
        ))}
      </div>
      {sourceHint && (
        <p className="upload-source-hint">{t[sourceHint.hintKey]}</p>
      )}

      <label className="upload-field">
        <span>{t.missionIdLabel}</span>
        <input
          type="text"
          value={missionId}
          onChange={(ev) => setMissionId(ev.target.value)}
          placeholder={t.missionIdPlaceholder}
          disabled={loading}
        />
      </label>

      <label className="upload-field">
        <span>{t.frameIntervalLabel}</span>
        <input
          type="number"
          min="0.5"
          max="10"
          step="0.5"
          value={frameInterval}
          onChange={(ev) => setFrameInterval(ev.target.value)}
          disabled={loading}
        />
      </label>

      <label className="upload-check">
        <input
          type="checkbox"
          checked={usePathGps}
          onChange={(ev) => setUsePathGps(ev.target.checked)}
          disabled={loading}
        />
        <span>{t.pathGpsLabel}</span>
      </label>

      {usePathGps && (
        <div className="upload-gps-grid">
          <input
            type="number"
            step="any"
            placeholder={t.startLat}
            value={startLat}
            onChange={(ev) => setStartLat(ev.target.value)}
            disabled={loading}
          />
          <input
            type="number"
            step="any"
            placeholder={t.startLon}
            value={startLon}
            onChange={(ev) => setStartLon(ev.target.value)}
            disabled={loading}
          />
          <input
            type="number"
            step="any"
            placeholder={t.endLat}
            value={endLat}
            onChange={(ev) => setEndLat(ev.target.value)}
            disabled={loading}
          />
          <input
            type="number"
            step="any"
            placeholder={t.endLon}
            value={endLon}
            onChange={(ev) => setEndLon(ev.target.value)}
            disabled={loading}
          />
        </div>
      )}

      <div className="upload-zone">
        <label className={`upload-btn ${loading ? "disabled" : ""}`}>
          <span className="upload-btn-icon">
            <NavIcon name={loading ? "recent" : "field"} />
          </span>
          <span>{loading ? t.uploading : t.uploadBtnBatch}</span>
          <input
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.avi,.mkv,.webm"
            multiple
            onChange={handleUpload}
            disabled={loading}
            hidden
          />
        </label>
      </div>

      {(progress || message) && (
        <p className={`upload-msg ${messageType}`}>
          {progress || message}
        </p>
      )}
    </section>
  );
}
