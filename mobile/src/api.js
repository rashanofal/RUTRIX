import { getToken } from "./auth";

const DEFAULT_API =
  process.env.EXPO_PUBLIC_API_URL || "https://your-api.railway.app";

export function getApiBase(override) {
  return (override || DEFAULT_API).replace(/\/$/, "");
}

async function authHeaders(apiBase, extra = {}) {
  const token = await getToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("انتهت مهلة الاتصال");
    }
    throw new Error("لا يوجد اتصال بالسيرفر");
  } finally {
    clearTimeout(timer);
  }
}

async function apiGet(path, apiBase, timeoutMs = 15000) {
  const headers = await authHeaders(apiBase);
  const res = await fetchWithTimeout(`${getApiBase(apiBase)}${path}`, { headers }, timeoutMs);
  if (res.status === 401) throw new Error("انتهت الجلسة");
  if (!res.ok) throw new Error("فشل تحميل البيانات");
  return res.json();
}

export async function uploadDetection(imageUri, apiBase, coords) {
  const formData = new FormData();
  formData.append("file", {
    uri: imageUri,
    name: "capture.jpg",
    type: "image/jpeg",
  });
  formData.append("device_type", "phone");

  if (coords?.latitude != null && coords?.longitude != null) {
    formData.append("latitude", String(coords.latitude));
    formData.append("longitude", String(coords.longitude));
  }

  const headers = await authHeaders(apiBase, { Accept: "application/json" });
  const response = await fetchWithTimeout(
    `${getApiBase(apiBase)}/api/detections/upload`,
    { method: "POST", body: formData, headers },
    90000
  );

  if (response.status === 401) throw new Error("انتهت الجلسة");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "فشل الرفع");
  }
  return response.json();
}

export async function checkHealth(apiBase) {
  try {
    const res = await fetchWithTimeout(`${getApiBase(apiBase)}/api/health`, {}, 8000);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchRecent(apiBase, limit = 100) {
  return apiGet(`/api/detections/recent?limit=${limit}`, apiBase);
}

export async function fetchStats(apiBase) {
  return apiGet("/api/detections/stats", apiBase);
}

export async function deleteDetection(apiBase, id) {
  const headers = await authHeaders(apiBase, { Accept: "application/json" });
  const res = await fetchWithTimeout(
    `${getApiBase(apiBase)}/api/detections/${id}`,
    { method: "DELETE", headers },
    15000
  );
  if (res.status === 401) throw new Error("انتهت الجلسة");
  if (!res.ok) throw new Error("Delete failed");
  return res.json();
}

export async function fetchPriorities(apiBase, limit = 20) {
  return apiGet(`/api/intelligence/priorities?limit=${limit}`, apiBase);
}

export async function fetchLeaderboard(apiBase, limit = 15) {
  return apiGet(`/api/intelligence/leaderboard?limit=${limit}`, apiBase);
}

export async function confirmDetection(apiBase, id) {
  const headers = await authHeaders(apiBase, { Accept: "application/json" });
  const res = await fetchWithTimeout(
    `${getApiBase(apiBase)}/api/intelligence/confirm/${id}`,
    { method: "POST", headers },
    15000
  );
  if (res.status === 401) throw new Error("انتهت الجلسة");
  if (!res.ok) throw new Error("Confirm failed");
  return res.json();
}

export async function fetchRouteQuality(apiBase, fromLat, fromLon, toLat, toLon) {
  const q = new URLSearchParams({
    from_lat: fromLat,
    from_lon: fromLon,
    to_lat: toLat,
    to_lon: toLon,
  });
  return apiGet(`/api/intelligence/route-quality?${q}`, apiBase);
}

export async function fetchWorkOrders(apiBase) {
  return apiGet("/api/maintenance/work-orders", apiBase);
}

export async function updateWorkOrder(apiBase, id, data) {
  const headers = await authHeaders(apiBase, {
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  const res = await fetchWithTimeout(
    `${getApiBase(apiBase)}/api/maintenance/work-orders/${id}`,
    { method: "PATCH", headers, body: JSON.stringify(data) },
    15000
  );
  if (res.status === 401) throw new Error("انتهت الجلسة");
  if (!res.ok) throw new Error("Update failed");
  return res.json();
}

export async function createWorkOrder(apiBase, detectionId) {
  const headers = await authHeaders(apiBase, {
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  const res = await fetchWithTimeout(
    `${getApiBase(apiBase)}/api/maintenance/work-orders`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ detection_id: detectionId }),
    },
    15000
  );
  if (res.status === 401) throw new Error("انتهت الجلسة");
  if (!res.ok) throw new Error("Create failed");
  return res.json();
}

export function reportPdfUrl(apiBase) {
  return `${getApiBase(apiBase)}/api/intelligence/report/pdf`;
}

export function imageUrl(apiBase, path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${getApiBase(apiBase)}${path}`;
}
