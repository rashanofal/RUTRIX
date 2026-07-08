const R_EARTH = 6371000;

export function rutHeatColor(score) {
  const s = Number(score) || 0;
  if (s >= 65) return "#dc2626";
  if (s >= 45) return "#f97316";
  if (s >= 25) return "#eab308";
  return "#22c55e";
}

export function rutLabelKey(score) {
  const s = Number(score) || 0;
  if (s >= 65) return "critical";
  if (s >= 45) return "poor";
  if (s >= 25) return "fair";
  return "safe";
}

export function severityColor(severity) {
  switch (severity) {
    case "critical":
      return "#ef4444";
    case "high":
      return "#f97316";
    case "medium":
      return "#eab308";
    default:
      return "#22c55e";
  }
}

export function destinationPoint(lat, lon, bearingDeg, distM) {
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distM / R_EARTH) +
      Math.cos(lat1) * Math.sin(distM / R_EARTH) * Math.cos(brng)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(distM / R_EARTH) * Math.cos(lat1),
      Math.cos(distM / R_EARTH) - Math.sin(lat1) * Math.sin(lat2)
    );
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

export function bearingBetween(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function haversineM(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(a));
}

/** Longitudinal road buffer — longer along road axis for clearer corridor. */
export function roadBufferPolygon(centerLat, centerLon, bearingDeg, lengthM = 100, widthM = 20) {
  const halfLen = lengthM / 2;
  const halfW = widthM / 2;
  const endA = destinationPoint(centerLat, centerLon, bearingDeg, halfLen);
  const endB = destinationPoint(centerLat, centerLon, bearingDeg + 180, halfLen);
  return [
    destinationPoint(endA[0], endA[1], bearingDeg + 90, halfW),
    destinationPoint(endA[0], endA[1], bearingDeg - 90, halfW),
    destinationPoint(endB[0], endB[1], bearingDeg - 90, halfW),
    destinationPoint(endB[0], endB[1], bearingDeg + 90, halfW),
  ];
}

export function lineCorridorPolygon(lat1, lon1, lat2, lon2, widthM = 16) {
  const bearing = bearingBetween(lat1, lon1, lat2, lon2);
  const length = haversineM(lat1, lon1, lat2, lon2);
  const midLat = (lat1 + lat2) / 2;
  const midLon = (lon1 + lon2) / 2;
  return roadBufferPolygon(midLat, midLon, bearing, Math.max(length + 8, 20), widthM);
}

function dedupePoints(points, minDistM = 3) {
  const out = [];
  for (const p of points) {
    const lat = p.latitude ?? p.lat;
    const lon = p.longitude ?? p.lon;
    if (lat == null || lon == null) continue;
    const dup = out.some((q) => haversineM(lat, lon, q.latitude, q.longitude) < minDistM);
    if (!dup) out.push({ latitude: lat, longitude: lon, bearing: p.bearing ?? null });
  }
  return out;
}

export function maintenancePriorityColor(d) {
  const rank = d.priority_rank ?? d.rut_score ?? 0;
  if (rank >= 70 || d.severity === "critical") return "#dc2626";
  if (rank >= 50 || d.severity === "high") return "#ea580c";
  if (rank >= 28 || d.severity === "medium") return "#ca8a04";
  return "#16a34a";
}

/** Circular influence zone radius (meters) — visible on street scale without covering blocks. */
export const BUFFER_SURVEY_M = 22;
export const BUFFER_POTHOLE_M = 16;
export const BUFFER_HIGH_M = 18;
export const BUFFER_CRITICAL_M = 20;

export function bufferRadiusM({ isSurvey = false, severity = null, rut = 0 } = {}) {
  if (isSurvey) return BUFFER_SURVEY_M;
  if (severity === "critical") return BUFFER_CRITICAL_M;
  if (severity === "high") return BUFFER_HIGH_M;
  if ((Number(rut) || 0) >= 65) return BUFFER_CRITICAL_M;
  if ((Number(rut) || 0) >= 45) return BUFFER_HIGH_M;
  return BUFFER_POTHOLE_M;
}

/** One circular buffer per map point. */
export function buildCircleBuffers(points, options = {}) {
  const pts = dedupePoints(points);
  return pts.map((p) => ({
    center: [p.latitude, p.longitude],
    radius: bufferRadiusM({ ...options, severity: options.severity ?? p.severity }),
    point: p,
  }));
}

export function resolveBearing(point, roadBearing, bearingMap) {
  if (point?.bearing != null && !Number.isNaN(point.bearing)) return point.bearing;
  if (roadBearing != null && !Number.isNaN(roadBearing)) return roadBearing;
  if (point?.id != null && bearingMap?.[String(point.id)] != null) {
    return bearingMap[String(point.id)];
  }
  const key = `${Number(point.latitude).toFixed(5)},${Number(point.longitude).toFixed(5)}`;
  if (bearingMap?.[key] != null) return bearingMap[key];
  return fallbackRoadBearing(point?.latitude, point?.longitude);
}

/** Immediate fallback until OSM bearing loads — keeps buffer visible on map. */
export function fallbackRoadBearing(lat, lon) {
  if (lat == null || lon == null) return 0;
  const n = Math.abs(Math.sin(lat * 12.9898 + lon * 78.233) * 43758.5453) % 1;
  return n < 0.5 ? 0 : 90;
}

/** Build corridor polygons — always draws (uses fallback bearing if OSM pending). */
export function buildCorridorPolygons(points, roadBearing = null, bearingMap = null) {
  const pts = dedupePoints(points);
  if (!pts.length) return [];

  if (pts.length === 1) {
    const bearing = resolveBearing(
      { ...pts[0], latitude: pts[0].latitude, longitude: pts[0].longitude },
      roadBearing,
      bearingMap
    );
    return [roadBufferPolygon(pts[0].latitude, pts[0].longitude, bearing)];
  }

  const sorted = [...pts].sort((a, b) => {
    if (a.latitude !== b.latitude) return a.latitude - b.latitude;
    return a.longitude - b.longitude;
  });

  const polys = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    polys.push(
      lineCorridorPolygon(
        sorted[i].latitude,
        sorted[i].longitude,
        sorted[i + 1].latitude,
        sorted[i + 1].longitude
      )
    );
  }
  return polys;
}
