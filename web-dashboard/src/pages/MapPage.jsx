import { useLocale } from "../context/LocaleContext";
import { useIsOwner } from "../hooks/useIsAdmin";
import PotholeMap from "../components/PotholeMap";
import DetectionDetail from "../components/DetectionDetail";

export default function MapPage({
  detections,
  selected,
  selectedId,
  onSelect,
  onBoundsChange,
  onDelete,
  deletingId,
  onConfirm,
  onVerify,
  onReject,
  wsConnected,
}) {
  const { t } = useLocale();
  const isOwner = useIsOwner();
  const pinned = detections.filter((d) => d.latitude != null).length;

  return (
    <div className="page-map">
      <div className="map-toolbar">
        {!isOwner ? (
          <span className="map-status-pill map-status-pill-scope">{t.myDataOnlyHint}</span>
        ) : null}
        <span className="map-status-pill map-status-pill-pins">
          {pinned} {pinned === 1 ? t.mapPins : t.mapPinsPlural}
        </span>
        <span className={`map-status-pill ${wsConnected ? "live" : "offline"}`}>
          {wsConnected ? `● ${t.liveSync}` : `○ ${t.disconnected}`}
        </span>
      </div>

      <div className="map-fullframe">
        <PotholeMap
          detections={detections}
          selectedId={selectedId}
          onSelect={onSelect}
          onBoundsChange={onBoundsChange}
          onDelete={onDelete}
          deletingId={deletingId}
        />
      </div>

      {selectedId && selected && (
        <aside className="map-drawer" aria-label={t.recent}>
          <button type="button" className="map-drawer-close" onClick={() => onSelect(null)} aria-label="Close">
            ✕
          </button>
          <DetectionDetail
            selected={selected}
            detections={detections}
            deletingId={deletingId}
            onDelete={onDelete}
            onConfirm={onConfirm}
            onVerify={onVerify}
            onReject={onReject}
          />
        </aside>
      )}
    </div>
  );
}
