import { useMemo, useState } from "react";
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

const SOURCES = [
  { id: "mms", labelKey: "deviceMms", hintKey: "sourceHintMms" },
  { id: "drone", labelKey: "deviceDrone", hintKey: "sourceHintDrone" },
  { id: "phone", labelKey: "devicePhone", hintKey: "sourceHintPhone" },
];

function hasPathGps(startLat, startLon, endLat, endLon) {
  return (
    startLat !== "" &&
    startLon !== "" &&
    endLat !== "" &&
    endLon !== "" &&
    Number.isFinite(Number(startLat)) &&
    Number.isFinite(Number(startLon)) &&
    Number.isFinite(Number(endLat)) &&
    Number.isFinite(Number(endLon))
  );
}

function isVideoFile(f) {
  return /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f.name);
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
  const [deviceType, setDeviceType] = useState("mms");
  const [missionId, setMissionId] = useState("");
  const [frameInterval, setFrameInterval] = useState("1");
  const [usePathGps, setUsePathGps] = useState(false);
  const [startLat, setStartLat] = useState("");
  const [startLon, setStartLon] = useState("");
  const [endLat, setEndLat] = useState("");
  const [endLon, setEndLon] = useState("");
  const [progress, setProgress] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);

  const sourceHint = SOURCES.find((s) => s.id === deviceType);
  const hasVideo = useMemo(() => pendingFiles.some(isVideoFile), [pendingFiles]);
  const pathReady = hasPathGps(startLat, startLon, endLat, endLon);

  const appendGpsFields = (formData, gps = {}) => {
    const slat = gps.startLat ?? startLat;
    const slon = gps.startLon ?? startLon;
    const elat = gps.endLat ?? endLat;
    const elon = gps.endLon ?? endLon;
    if (slat !== "" && slon !== "") {
      formData.append("latitude", String(Number(slat)));
      formData.append("longitude", String(Number(slon)));
    }
    if (elat !== "" && elon !== "") {
      formData.append("end_latitude", String(Number(elat)));
      formData.append("end_longitude", String(Number(elon)));
    }
  };

  const fillStartFromHere = async () => {
    setUsePathGps(true);
    const c = await getDeviceCoords();
    if (!c) {
      setMessage(t.gpsBrowserDenied);
      setMessageType("err");
      return;
    }
    setStartLat(String(c.latitude));
    setStartLon(String(c.longitude));
    setMessage(t.gpsStartFilled);
    setMessageType("ok");
  };

  const fillEndFromHere = async () => {
    setUsePathGps(true);
    const c = await getDeviceCoords();
    if (!c) {
      setMessage(t.gpsBrowserDenied);
      setMessageType("err");
      return;
    }
    setEndLat(String(c.latitude));
    setEndLon(String(c.longitude));
    setMessage(t.gpsEndFilled);
    setMessageType("ok");
  };

  const onFilesPicked = (ev) => {
    const list = Array.from(ev.target.files || []);
    ev.target.value = "";
    if (!list.length) return;
    setPendingFiles(list);
    setMessage("");
    setMessageType("");
    if (list.some(isVideoFile)) {
      setUsePathGps(true);
    }
  };

  const handleUpload = async () => {
    if (!pendingFiles.length) return;

    const videoInBatch = pendingFiles.some(isVideoFile);
    const isBatch = pendingFiles.length > 1 || videoInBatch;

    let gpsStartLat = startLat;
    let gpsStartLon = startLon;
    let gpsEndLat = endLat;
    let gpsEndLon = endLon;

    if (videoInBatch && !pathReady) {
      const c = await getDeviceCoords();
      if (c) {
        gpsStartLat = String(c.latitude);
        gpsStartLon = String(c.longitude);
        setStartLat(gpsStartLat);
        setStartLon(gpsStartLon);
        setUsePathGps(true);
      } else {
        setMessage(t.videoPathGpsRequired);
        setMessageType("err");
        return;
      }
    }

    const hasStart =
      gpsStartLat !== "" &&
      gpsStartLon !== "" &&
      Number.isFinite(Number(gpsStartLat)) &&
      Number.isFinite(Number(gpsStartLon));

    if (videoInBatch && !hasStart) {
      setMessage(t.videoPathGpsRequired);
      setMessageType("err");
      return;
    }

    const resolvedGps = {
      startLat: gpsStartLat,
      startLon: gpsStartLon,
      endLat: gpsEndLat,
      endLon: gpsEndLon,
    };

    setLoading(true);
    setMessage(t.uploading);
    setMessageType("");
    setProgress("");

    try {
      if (isBatch) {
        const formData = new FormData();
        pendingFiles.forEach((f) => formData.append("files", f));
        formData.append("device_type", deviceType);
        if (missionId.trim()) formData.append("mission_id", missionId.trim());
        formData.append("frame_interval_sec", String(Number(frameInterval) || 1));
        if (videoInBatch || usePathGps) appendGpsFields(formData, resolvedGps);

        setProgress(
          videoInBatch
            ? t.batchProgressVideo
            : t.batchProgressImages.replace("{n}", String(pendingFiles.length))
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
        setPendingFiles([]);
        onUploaded?.(data);
      } else {
        const file = pendingFiles[0];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("device_type", deviceType);
        if (missionId.trim()) formData.append("source_id", missionId.trim());
        if (usePathGps) appendGpsFields(formData, resolvedGps);

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
        setPendingFiles([]);
        onUploaded?.(data);
      }
    } catch (err) {
      setMessage(err?.message || t.uploadFail);
      setMessageType("err");
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  return (
    <section className="upload-panel">
      <div className="section-label">
        <span className="section-label-icon"><NavIcon name="signal" /></span>
        <span>{t.uploadTitle}</span>
      </div>
      <p className="upload-hint">{t.uploadHintBatch}</p>
      <p className="upload-hint upload-hint-exif">{t.uploadExifHint}</p>

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
      {sourceHint && <p className="upload-source-hint">{t[sourceHint.hintKey]}</p>}

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

      {hasVideo ? (
        <section className="upload-video-path-card" aria-label={t.videoPathTitle}>
          <h4 className="upload-video-path-title">{t.videoPathTitle}</h4>
          <p className="upload-video-path-sub">{t.videoPathSub}</p>
          <ol className="upload-video-steps">
            {(t.videoPathSteps || []).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <label className="upload-check">
        <input
          type="checkbox"
          checked={usePathGps || hasVideo}
          onChange={(ev) => setUsePathGps(ev.target.checked)}
          disabled={loading || hasVideo}
        />
        <span>{t.pathGpsLabel}</span>
      </label>

      {(usePathGps || hasVideo) && (
        <div className="upload-gps-block">
          <div className="upload-gps-actions">
            <button type="button" className="upload-gps-btn" onClick={fillStartFromHere} disabled={loading}>
              {t.gpsUseStartHere}
            </button>
            <button type="button" className="upload-gps-btn" onClick={fillEndFromHere} disabled={loading}>
              {t.gpsUseEndHere}
            </button>
          </div>
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
          <p className="upload-gps-note">{t.videoPathNote}</p>
        </div>
      )}

      <div className="upload-zone">
        <label className={`upload-btn ${loading ? "disabled" : ""}`}>
          <span className="upload-btn-icon">
            <NavIcon name="field" />
          </span>
          <span>{t.uploadPickFiles}</span>
          <input
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.avi,.mkv,.webm"
            multiple
            onChange={onFilesPicked}
            disabled={loading}
            hidden
          />
        </label>

        {pendingFiles.length > 0 ? (
          <div className="upload-pending">
            <p className="upload-pending-label">{t.uploadPending}</p>
            <ul className="upload-pending-list">
              {pendingFiles.map((f) => (
                <li key={`${f.name}-${f.size}`}>
                  {isVideoFile(f) ? "🎬 " : "📷 "}
                  {f.name}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="upload-submit-btn"
              onClick={handleUpload}
              disabled={loading}
            >
              {loading ? t.uploading : t.uploadStartBtn}
            </button>
            {hasVideo && !pathReady ? (
              <p className="upload-pending-warn">{t.videoApproxHint}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {(progress || message) && (
        <p className={`upload-msg ${messageType}`}>{progress || message}</p>
      )}
    </section>
  );
}
