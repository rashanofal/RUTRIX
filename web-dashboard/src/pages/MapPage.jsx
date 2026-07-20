import { useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { useIsAdmin } from "../hooks/useIsAdmin";
import PotholeMap from "../components/PotholeMap";
import DetectionDetail from "../components/DetectionDetail";
import PageExportToolbar from "../components/PageExportToolbar";
import MapFilterBar from "../components/MapFilterBar";
import { DEFAULT_MAP_FILTERS, filterMapDetections } from "../utils/mapFilters";

export default function MapPage({
  detections,
  workOrders = [],
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
  const isAdmin = useIsAdmin();
  const [mapFilters, setMapFilters] = useState(DEFAULT_MAP_FILTERS);

  const filteredDetections = useMemo(
    () => filterMapDetections(detections, workOrders, mapFilters),
    [detections, workOrders, mapFilters]
  );

  const pinned = filteredDetections.filter((d) => d.latitude != null).length;
  const totalPinned = detections.filter((d) => d.latitude != null).length;

  return (
    <div className="page-map">
      <header className="map-chrome">
        <div className="map-toolbar">
          <div className="map-toolbar-meta">
            {!isAdmin ? (
              <span className="map-status-pill map-status-pill-scope">{t.myDataOnlyHint}</span>
            ) : null}
            <span className="map-status-pill map-status-pill-pins">
              {pinned} {pinned === 1 ? t.mapPins : t.mapPinsPlural}
            </span>
            <span className={`map-status-pill ${wsConnected ? "live" : "offline"}`}>
              {wsConnected ? `● ${t.liveSync}` : `○ ${t.disconnected}`}
            </span>
          </div>
          <PageExportToolbar
            variant="toolbar"
            className="map-report-toolbar"
            exportContext={{ detections: filteredDetections }}
          />
        </div>

        <MapFilterBar
          filters={mapFilters}
          onChange={setMapFilters}
          resultCount={pinned}
          totalCount={totalPinned}
        />
      </header>

      <div className="map-fullframe">
        <PotholeMap
          detections={filteredDetections}
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
            workOrders={workOrders}
            deletingId={deletingId}
            onDelete={onDelete}
            onConfirm={onConfirm}
            onVerify={onVerify}
            onReject={onReject}
            onSelect={onSelect}
            canReview={isAdmin}
          />
        </aside>
      )}
    </div>
  );
}
