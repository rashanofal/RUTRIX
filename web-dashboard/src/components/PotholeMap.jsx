import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
  useMapEvents,
  ZoomControl,
} from "react-leaflet";
import L from "leaflet";
import { useLocale } from "../context/LocaleContext";
import { deviceLabel } from "../i18n/translations";
import NavIcon from "./NavIcons";
import {
  bufferRadiusM,
  rutHeatColor,
  severityColor,
  maintenancePriorityColor,
  groupDetectionsForMap,
} from "../utils/mapGeo";

const MAP_LAYERS = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    subdomains: "abc",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
  },
};

const photoIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const potholeIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const verifiedIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function BoundsWatcher({ onBoundsChange }) {
  useMapEvents({
    moveend: (e) => {
      const b = e.target.getBounds();
      onBoundsChange({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      });
    },
    load: (e) => {
      const b = e.target.getBounds();
      onBoundsChange({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      });
    },
  });
  return null;
}

function markerIcon(d) {
  const holes = d.pothole_count ?? (d.class_name === "photo" ? 0 : 1);
  if (holes === 0) return photoIcon;
  if (d.detection_status === "verified" || d.cloud_verified) return verifiedIcon;
  const sev = d.severity || "medium";
  if (sev === "critical") {
    return new L.Icon({
      iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
  }
  if (sev === "high") return potholeIcon;
  if (sev === "medium") {
    return new L.Icon({
      iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
  }
  return verifiedIcon;
}

function FitAllMarkers({ detections, positions }) {
  const map = useMap();
  const didFit = useRef(false);

  useEffect(() => {
    const pts = detections
      .filter((d) => positions[d.id])
      .map((d) => positions[d.id]);
    if (!pts.length || didFit.current) return;
    didFit.current = true;
    if (pts.length === 1) {
      map.setView(pts[0], 16, { animate: false });
    } else {
      map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 16, animate: false });
    }
  }, [detections.length, map, positions]);

  return null;
}

function FlyToSelected({ selectedId, positions }) {
  const map = useMap();
  const prevId = useRef(null);

  useEffect(() => {
    if (!selectedId || selectedId === prevId.current) return;
    prevId.current = selectedId;
    if (positions[selectedId]) {
      map.flyTo(positions[selectedId], 17, { duration: 0.6 });
    }
  }, [selectedId, positions, map]);

  return null;
}

function DetectionImage({ detection, openLabel }) {
  const url = detection.image_url;
  if (!url) return null;

  return (
    <div className="popup-image-wrap">
      <img src={url} alt="" className="popup-image-stable" loading="lazy" />
      <a className="popup-open-link" href={url} target="_blank" rel="noreferrer">
        {openLabel}
      </a>
    </div>
  );
}

function MapLegend({ t, showSeverity, showPriority }) {
  return (
    <div className="map-legend-bottom">
      <div className="map-legend-block map-legend-rut">
        <span className="map-legend-title">{t.mapLegendRut}</span>
        <div className="map-legend-gradient rut-gradient" />
        <div className="map-legend-labels map-legend-labels-ltr">
          <span className="legend-rut-safe">{t.rutLabelSafe}</span>
          <span>{t.rutLabelFair}</span>
          <span>{t.rutLabelPoor}</span>
          <span className="legend-rut-danger">{t.rutLabelCritical}</span>
        </div>
      </div>
      {showSeverity && (
        <div className="map-legend-block">
          <span className="map-legend-title">{t.mapLegendSeverity}</span>
          <div className="map-legend-severity">
            <span><i style={{ background: severityColor("low") }} /> {t.sevLow}</span>
            <span><i style={{ background: severityColor("medium") }} /> {t.sevMedium}</span>
            <span><i style={{ background: severityColor("high") }} /> {t.sevHigh}</span>
            <span><i style={{ background: severityColor("critical") }} /> {t.sevCritical}</span>
          </div>
        </div>
      )}
      {showPriority && (
        <div className="map-legend-block">
          <span className="map-legend-title">{t.mapLegendMaintenance}</span>
          <div className="map-legend-severity">
            <span><i style={{ background: maintenancePriorityColor({ severity: "low" }) }} /> {t.maintP4}</span>
            <span><i style={{ background: maintenancePriorityColor({ severity: "medium" }) }} /> {t.maintP3}</span>
            <span><i style={{ background: maintenancePriorityColor({ severity: "high" }) }} /> {t.maintP2}</span>
            <span><i style={{ background: maintenancePriorityColor({ severity: "critical" }) }} /> {t.maintP1}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function LayerToggle({ id, checked, onChange, label, icon }) {
  return (
    <label className={`map-layer-toggle ${checked ? "active" : ""}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="map-layer-toggle-icon">
        <NavIcon name={icon} />
      </span>
      <span className="map-layer-toggle-label">{label}</span>
    </label>
  );
}

export default function PotholeMap({
  detections,
  selectedId,
  onSelect,
  onBoundsChange,
  onDelete,
  deletingId,
  center = [30.0444, 31.2357],
  zoom = 12,
}) {
  const { t, locale } = useLocale();
  const [mapReady, setMapReady] = useState(false);
  const [baseLayer, setBaseLayer] = useState("street");
  const [layers, setLayers] = useState({
    markers: true,
    roadQuality: true,
    severity: false,
    maintenancePriority: false,
  });
  const mapPins = useMemo(() => groupDetectionsForMap(detections), [detections]);
  const positions = useMemo(() => {
    const out = {};
    for (const d of mapPins) {
      out[d.id] = [d.latitude, d.longitude];
      for (const gid of d.group_ids || []) out[gid] = out[d.id];
    }
    return out;
  }, [mapPins]);
  const layer = MAP_LAYERS[baseLayer];
  const zoomPosition = locale === "ar" ? "bottomleft" : "bottomright";

  const setLayer = (key, value) => {
    setLayers((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    setMapReady(true);
  }, []);

  const visible = mapPins.filter((d) => positions[d.id]);

const SAFE_SURVEY_RUT = 8;

  const severityTargets = visible.filter((d) => (d.pothole_count ?? 0) > 0);

  const roadQualityBuffers = useMemo(() => {
    const buffers = [];
    const clusterMap = new Map();

    for (const d of visible) {
      if ((d.pothole_count ?? 0) === 0) {
        buffers.push({
          key: `survey-${d.id}`,
          points: [
            {
              id: d.id,
              latitude: d.latitude,
              longitude: d.longitude,
              bearing: d.bearing,
            },
          ],
          rut: SAFE_SURVEY_RUT,
          isSurvey: true,
        });
        continue;
      }

      const clusterId = d.cluster_id || `solo-${d.id}`;
      if (!clusterMap.has(clusterId)) {
        clusterMap.set(clusterId, { points: [], rutSum: 0, rutCount: 0 });
      }
      const group = clusterMap.get(clusterId);
      group.points.push({
        id: d.id,
        latitude: d.latitude,
        longitude: d.longitude,
        bearing: d.bearing,
      });
      group.rutSum += d.rut_score || 0;
      group.rutCount += 1;
    }

    for (const [clusterId, group] of clusterMap) {
      buffers.push({
        key: `cluster-${clusterId}`,
        points: group.points,
        rut: group.rutCount ? group.rutSum / group.rutCount : 0,
        isSurvey: false,
      });
    }

    return buffers;
  }, [visible]);

  const priorityTargets = useMemo(
    () =>
      [...severityTargets].sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        const sa = order[a.severity] ?? 4;
        const sb = order[b.severity] ?? 4;
        if (sa !== sb) return sa - sb;
        return (b.priority_rank ?? b.rut_score ?? 0) - (a.priority_rank ?? a.rut_score ?? 0);
      }),
    [severityTargets]
  );

  const roadQualityCircles = useMemo(() => {
    const circles = [];
    for (const buf of roadQualityBuffers) {
      for (const pt of buf.points) {
        circles.push({
          key: `${buf.key}-${pt.id}`,
          center: [pt.latitude, pt.longitude],
          radius: bufferRadiusM({ isSurvey: buf.isSurvey, rut: buf.rut }),
          color: rutHeatColor(buf.isSurvey ? SAFE_SURVEY_RUT : buf.rut),
          isSurvey: buf.isSurvey,
          rut: buf.rut,
          pointCount: buf.points.length,
        });
      }
    }
    return circles;
  }, [roadQualityBuffers]);

  useEffect(() => {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });
  }, []);

  const [controlsOpen, setControlsOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth > 768
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const sync = () => setControlsOpen(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (!mapReady) {
    return <div className="map-loading">{t.mapLoading}</div>;
  }

  return (
    <div className="map-wrap">
      <button
        type="button"
        className="map-controls-toggle"
        onClick={() => setControlsOpen((open) => !open)}
        aria-expanded={controlsOpen}
        aria-label={t.mapLayersLabel}
      >
        <NavIcon name="map" />
        <span>{t.mapLayersLabel}</span>
      </button>
      <div className={`map-controls-panel ${controlsOpen ? "is-open" : ""}`}>
        <section className="map-controls-section">
          <h4 className="map-controls-heading">{t.mapBasemapLabel}</h4>
          <div className="basemap-options">
            <button
              type="button"
              className={`basemap-btn ${baseLayer === "street" ? "active" : ""}`}
              onClick={() => setBaseLayer("street")}
            >
              <span className="basemap-btn-title">{t.mapStreet}</span>
              <span className="basemap-btn-sci">{t.mapStreetSci}</span>
            </button>
            <button
              type="button"
              className={`basemap-btn ${baseLayer === "satellite" ? "active" : ""}`}
              onClick={() => setBaseLayer("satellite")}
            >
              <span className="basemap-btn-title">{t.mapSatellite}</span>
              <span className="basemap-btn-sci">{t.mapSatelliteSci}</span>
            </button>
          </div>
        </section>

        <div className="map-controls-divider" aria-hidden />

        <section className="map-controls-section">
          <h4 className="map-controls-heading">{t.mapLayersLabel}</h4>
          <div className="map-layer-panel">
            <LayerToggle
              id="layer-markers"
              checked={layers.markers}
              onChange={(v) => setLayer("markers", v)}
              label={t.layerMarkers}
              icon="map"
            />
            <LayerToggle
              id="layer-quality"
              checked={layers.roadQuality}
              onChange={(v) => setLayer("roadQuality", v)}
              label={t.layerRoadQuality}
              icon="quality"
            />
            <LayerToggle
              id="layer-severity"
              checked={layers.severity}
              onChange={(v) => setLayer("severity", v)}
              label={t.layerSeverity}
              icon="warning"
            />
            <LayerToggle
              id="layer-priority"
              checked={layers.maintenancePriority}
              onChange={(v) => setLayer("maintenancePriority", v)}
              label={t.layerMaintenancePriority}
              icon="ops"
            />
          </div>
        </section>
      </div>

      <MapLegend
        t={t}
        showSeverity={layers.severity}
        showPriority={layers.maintenancePriority}
      />

      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
      >
        <ZoomControl position={zoomPosition} />
        <TileLayer
          key={baseLayer}
          attribution={layer.attribution}
          url={layer.url}
          {...(layer.subdomains ? { subdomains: layer.subdomains } : {})}
        />
        <BoundsWatcher onBoundsChange={onBoundsChange} />
        <FitAllMarkers detections={visible} positions={positions} />
        <FlyToSelected selectedId={selectedId} positions={positions} />

        {layers.roadQuality &&
          roadQualityCircles.map((c) => (
            <Circle
              key={c.key}
              center={c.center}
              radius={c.radius}
              pathOptions={{
                color: c.color,
                fillColor: c.color,
                fillOpacity: c.isSurvey ? 0.35 : 0.28,
                weight: c.isSurvey ? 2.5 : 2,
              }}
            >
              <Popup>
                <div className="popup-content">
                  <h3>{c.isSurvey ? t.surveySafeRoad : t.roadQualityCluster}</h3>
                  <p>
                    {c.isSurvey ? (
                      t.noPotholes
                    ) : (
                      <>
                        RUT: <strong>{Math.round(c.rut)}</strong> · {c.pointCount}{" "}
                        {t.detectionsCount}
                      </>
                    )}
                  </p>
                </div>
              </Popup>
            </Circle>
          ))}

        {layers.severity &&
          severityTargets.map((d) => {
            const color = severityColor(d.severity);
            const radius = bufferRadiusM({ severity: d.severity, rut: d.rut_score });
            return (
              <Circle
                key={`sev-${d.id}`}
                center={[d.latitude, d.longitude]}
                radius={radius}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.3,
                  weight: 1.5,
                  dashArray: "4 4",
                }}
              />
            );
          })}

        {layers.maintenancePriority &&
          priorityTargets.map((d) => {
            const color = maintenancePriorityColor(d);
            const radius = bufferRadiusM({ severity: d.severity, rut: d.rut_score });
            return (
              <Circle
                key={`pri-${d.id}`}
                center={[d.latitude, d.longitude]}
                radius={radius}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.34,
                  weight: 2.5,
                }}
              >
                <Popup>
                  <div className="popup-content">
                    <h3>{t.maintenancePriorityPopup}</h3>
                    <p>
                      {t.severity}: <strong>{d.severity}</strong> · RUT{" "}
                      <strong>{d.rut_score ?? 0}</strong>
                    </p>
                  </div>
                </Popup>
              </Circle>
            );
          })}

        {layers.markers &&
          visible.map((d) => (
            <Marker
              key={d.id}
              position={positions[d.id]}
              icon={markerIcon(d)}
              eventHandlers={{
                click: () => onSelect(d.id),
              }}
            >
              <Popup minWidth={240} maxWidth={300} autoPan={false} keepInView={false}>
                <div className="popup-content">
                  <h3>
                    {(d.pothole_count ?? 0) === 0
                      ? `${t.photo} #${d.id}`
                      : (d.pothole_count || 0) > 1
                        ? (t.multiplePotholes || "{n}").replace("{n}", String(d.pothole_count))
                        : `${t.pothole} #${d.id}`}
                  </h3>
                  <DetectionImage detection={d} openLabel={t.openImage} />
                  {(d.pothole_count ?? 0) === 0 ? (
                    <p className="popup-photo-note">{t.noPotholes}</p>
                  ) : (
                    <>
                      <p>
                        RUT: <strong>{d.rut_score ?? 0}</strong> · {t.severity}:{" "}
                        <strong>{d.severity || "low"}</strong>
                      </p>
                      <p>
                        {t.confidence}: <strong>{(d.confidence * 100).toFixed(1)}%</strong>
                        {d.estimated_depth_cm != null && (
                          <> · {d.estimated_depth_cm}×{d.estimated_width_cm} cm</>
                        )}
                      </p>
                      {d.repair_cost_min > 0 && (
                        <p>
                          {t.repairEst}: ${d.repair_cost_min?.toFixed(0)}–$
                          {d.repair_cost_max?.toFixed(0)}
                        </p>
                      )}
                      {d.confirmation_count > 1 && (
                        <p>
                          ✓ {d.confirmation_count} {t.confirmations}
                        </p>
                      )}
                    </>
                  )}
                  <p>
                    {t.source}: {deviceLabel(t, d.device_type)}
                  </p>
                  <p className="popup-coords">
                    {d.latitude?.toFixed(6)}, {d.longitude?.toFixed(6)}
                  </p>
                  {onDelete && (
                    <button
                      type="button"
                      className="popup-delete-btn"
                      disabled={deletingId === d.id}
                      onClick={() => onDelete(d.id)}
                    >
                      {deletingId === d.id ? t.deleting : `🗑️ ${t.delete}`}
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
