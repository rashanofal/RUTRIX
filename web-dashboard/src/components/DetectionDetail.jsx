import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { severityLabel } from "../i18n/translations";
import { countClusterReports } from "../hooks/useCriticalAlerts";
import DetectionStatusPipeline from "./DetectionStatusPipeline";

/** All frames from a survey mission, one card per image, with pothole counts. */
function missionSurveyFrames(detections, missionId) {
  if (!missionId) return [];
  const byUrl = new Map();
  for (const d of detections) {
    if (d.mission_id !== missionId) continue;
    const key = d.image_url || d.image_path || `id:${d.id}`;
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(d);
  }

  return Array.from(byUrl.entries())
    .map(([frameKey, items]) => {
      const holes = items.filter((x) => x.class_name !== "photo");
      const primary =
        [...holes].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0] ||
        items[0];
      return {
        id: primary.id,
        image_url: primary.image_url,
        frame_index: primary.frame_index,
        timestamp_sec: primary.timestamp_sec,
        latitude: primary.latitude,
        longitude: primary.longitude,
        potholeCount: holes.length,
        hasGps: primary.latitude != null && primary.longitude != null,
        frameKey,
      };
    })
    .sort(
      (a, b) =>
        (a.frame_index ?? 0) - (b.frame_index ?? 0) || a.id - b.id
    );
}

function formatTimestamp(sec) {
  if (sec == null || Number.isNaN(Number(sec))) return null;
  const total = Math.max(0, Math.floor(Number(sec)));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function DetectionDetail({
  selected,
  detections = [],
  deletingId,
  onDelete,
  onConfirm,
  onVerify,
  onReject,
  onSelect,
  onShowOnMap,
  canReview = false,
}) {
  const { t } = useLocale();
  const videoRef = useRef(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const siblings = selected?.image_url
    ? detections.filter((d) => d.image_url === selected.image_url)
    : selected
      ? [selected]
      : [];
  const potholeSiblings = siblings.filter((d) => d.class_name !== "photo");

  const missionFrames = useMemo(
    () => (selected ? missionSurveyFrames(detections, selected.mission_id) : []),
    [detections, selected]
  );

  const selectFrame = (id) => {
    if (onShowOnMap) onShowOnMap(id);
    else onSelect?.(id);
  };

  useEffect(() => {
    setLightboxOpen(false);
  }, [selected?.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !selected?.video_url || selected.timestamp_sec == null) return;
    const target = Number(selected.timestamp_sec) || 0;
    const seek = () => {
      try {
        v.currentTime = target;
      } catch {
        /* ignore seek errors while metadata loads */
      }
    };
    if (v.readyState >= 1) seek();
    else v.addEventListener("loadedmetadata", seek, { once: true });
    return () => v.removeEventListener("loadedmetadata", seek);
  }, [selected?.id, selected?.video_url, selected?.timestamp_sec]);

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  if (!selected) return null;

  const tsLabel = formatTimestamp(selected.timestamp_sec);
  const selectedHoleCount = potholeSiblings.length;

  return (
    <div className="detail-panel section-card">
      {selected.video_url ? (
        <div className="detail-video-block">
          <p className="detail-section-label">
            {t.surveyVideoLabel}
            {tsLabel ? ` · ${tsLabel}` : ""}
          </p>
          <video
            key={selected.video_url}
            ref={videoRef}
            className="detail-video"
            src={selected.video_url}
            controls
            playsInline
            preload="metadata"
          />
        </div>
      ) : null}

      {selected.image_url && (
        <button
          type="button"
          className="detail-image-btn"
          onClick={() => setLightboxOpen(true)}
          aria-label={t.openFullImage}
        >
          <img src={selected.image_url} alt="" className="detail-image" />
          <span className="detail-image-hint">{t.openFullImage}</span>
        </button>
      )}

      <p className={`detail-frame-status ${selectedHoleCount > 0 ? "has-holes" : "no-holes"}`}>
        {selectedHoleCount > 0
          ? t.framePotholeCount.replace("{n}", String(selectedHoleCount))
          : t.frameNoPotholes}
      </p>

      {selected.latitude != null && selected.longitude != null ? (
        <button
          type="button"
          className="detail-show-on-map"
          onClick={() => selectFrame(selected.id)}
        >
          {t.showOnMap} · {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
        </button>
      ) : (
        <p className="detail-meta">{t.noGps}</p>
      )}

      {missionFrames.length > 0 ? (
        <div className="detail-mission-strip">
          <p className="detail-section-label">
            {t.surveyAllFrames.replace("{n}", String(missionFrames.length))}
          </p>
          <p className="detail-strip-hint">{t.surveyFrameTapHint}</p>
          <div className="detail-frame-strip" role="list">
            {missionFrames.map((frame) => {
              const active =
                frame.id === selected.id ||
                (frame.image_url && frame.image_url === selected.image_url);
              const hasHoles = frame.potholeCount > 0;
              return (
                <button
                  key={frame.frameKey}
                  type="button"
                  role="listitem"
                  className={`detail-frame-card${active ? " is-active" : ""}${hasHoles ? " has-holes" : " no-holes"}`}
                  onClick={() => selectFrame(frame.id)}
                  title={
                    frame.hasGps
                      ? t.showOnMap
                      : frame.timestamp_sec != null
                        ? formatTimestamp(frame.timestamp_sec)
                        : `#${frame.id}`
                  }
                >
                  <span className="detail-frame-thumb">
                    {frame.image_url ? (
                      <img src={frame.image_url} alt="" loading="lazy" />
                    ) : (
                      <span className="detail-frame-fallback">#{frame.id}</span>
                    )}
                  </span>
                  <span className="detail-frame-caption">
                    {hasHoles
                      ? t.framePotholeCount.replace("{n}", String(frame.potholeCount))
                      : t.frameNoPotholes}
                  </span>
                  <span className="detail-frame-sub">
                    {frame.timestamp_sec != null
                      ? formatTimestamp(frame.timestamp_sec)
                      : frame.hasGps
                        ? t.tapToShowOnMap
                        : t.noGps}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {potholeSiblings.length > 1 && (
        <p className="detail-group-note">
          {t.multiplePotholes.replace("{n}", String(potholeSiblings.length))}
        </p>
      )}
      {selected.reporter_name ? (
        <p className="detail-reporter">
          {t.uploadedBy}: <strong>{selected.reporter_name}</strong>
        </p>
      ) : null}
      <p className="detail-meta">
        {selected.class_name === "photo" ? t.photo : t.pothole} #{selected.id}
        {selected.class_name !== "photo" && (
          <>
            {" "}
            — {t.rutShort} {selected.rut_score ?? 0} · {t.severity}:{" "}
            {severityLabel(t, selected.severity)} — {t.confidence}:{" "}
            {(selected.confidence * 100).toFixed(0)}%
          </>
        )}
      </p>
      {selected.class_name !== "photo" && selected.cluster_id && detections.length > 0 && (
        <p className="detail-cluster-note">
          {t.clusterReports.replace(
            "{n}",
            String(countClusterReports(detections, selected.cluster_id))
          )}
        </p>
      )}
      <DetectionStatusPipeline detection={selected} />
      {onDelete ? (
        <button
          type="button"
          className="delete-one-btn"
          disabled={deletingId === selected.id}
          onClick={() => onDelete(selected.id)}
        >
          {deletingId === selected.id ? t.deleting : `🗑️ ${t.delete}`}
        </button>
      ) : null}
      {selected.class_name !== "photo" && canReview && (
        <div className="detail-actions">
          <button type="button" className="confirm-btn" onClick={() => onConfirm(selected.id)}>
            ✓ {t.confirmReport}
          </button>
          <button type="button" className="verify-btn" onClick={() => onVerify(selected.id)}>
            ✅ {t.markVerified}
          </button>
          <button type="button" className="reject-btn" onClick={() => onReject(selected.id)}>
            ✕ {t.reject}
          </button>
        </div>
      )}
      {selected.class_name !== "photo" && !canReview && (
        <div className="detail-actions detail-actions-field">
          <button type="button" className="confirm-btn" onClick={() => onConfirm(selected.id)}>
            ✓ {t.confirmReport}
          </button>
        </div>
      )}

      {lightboxOpen && selected.image_url ? (
        <div
          className="detail-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t.openFullImage}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="detail-lightbox-close"
            onClick={() => setLightboxOpen(false)}
            aria-label={t.close || "Close"}
          >
            ✕
          </button>
          <img
            src={selected.image_url}
            alt=""
            className="detail-lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
