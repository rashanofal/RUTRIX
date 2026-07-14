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

function guessMime(name, fallback = "image/jpeg") {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  return fallback;
}

export async function uploadDetection(imageUri, apiBase, coords, options = {}) {
  const name = options.name || "capture.jpg";
  const formData = new FormData();
  formData.append("file", {
    uri: imageUri,
    name,
    type: options.type || guessMime(name),
  });
  formData.append("device_type", options.deviceType || "phone");

  if (coords?.latitude != null && coords?.longitude != null) {
    formData.append("latitude", String(coords.latitude));
    formData.append("longitude", String(coords.longitude));
  }
  if (options.sourceId) formData.append("source_id", options.sourceId);

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

/** Batch upload images and/or one video — EXIF GPS preferred per image on the server. */
export async function uploadDetectionBatch(assets, apiBase, coords, options = {}) {
  const list = (assets || []).filter((a) => a?.uri);
  if (!list.length) throw new Error("لا ملفات");

  const formData = new FormData();
  list.forEach((asset, idx) => {
    const name =
      asset.fileName ||
      asset.name ||
      (asset.type?.startsWith("video") ? `clip_${idx}.mp4` : `photo_${idx}.jpg`);
    formData.append("files", {
      uri: asset.uri,
      name,
      type: asset.mimeType || asset.type || guessMime(name),
    });
  });
  formData.append("device_type", options.deviceType || "phone");
  formData.append("frame_interval_sec", String(options.frameIntervalSec || 1));
  if (options.missionId) formData.append("mission_id", options.missionId);

  // Fallback only when photos lack EXIF (server still prefers EXIF when present)
  if (coords?.latitude != null && coords?.longitude != null) {
    formData.append("latitude", String(coords.latitude));
    formData.append("longitude", String(coords.longitude));
  }

  const headers = await authHeaders(apiBase, { Accept: "application/json" });
  const response = await fetchWithTimeout(
    `${getApiBase(apiBase)}/api/detections/upload-batch`,
    { method: "POST", body: formData, headers },
    300000
  );

  if (response.status === 401) throw new Error("انتهت الجلسة");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "فشل رفع الدفعة");
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

export async function fetchMyWorkOrders(apiBase) {
  return apiGet("/api/maintenance/work-orders?assigned_to_me=true", apiBase);
}

export async function fetchWorkOrder(apiBase, id) {
  return apiGet(`/api/maintenance/work-orders/${id}`, apiBase);
}

async function workOrderAction(apiBase, id, action, body) {
  const headers = await authHeaders(apiBase, {
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  const res = await fetchWithTimeout(
    `${getApiBase(apiBase)}/api/maintenance/work-orders/${id}/${action}`,
    { method: "POST", headers, body: body ? JSON.stringify(body) : undefined },
    20000
  );
  if (res.status === 401) throw new Error("انتهت الجلسة");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "فشل تنفيذ الإجراء");
  }
  return res.json();
}

export async function acceptWorkOrder(apiBase, id) {
  return workOrderAction(apiBase, id, "accept");
}

export async function declineWorkOrder(apiBase, id, reason) {
  return workOrderAction(apiBase, id, "decline", { reason });
}

export async function startWorkOrder(apiBase, id) {
  return workOrderAction(apiBase, id, "start");
}

export async function completeWorkOrder(apiBase, id, { notes, proofUri } = {}) {
  const formData = new FormData();
  if (notes) formData.append("notes", notes);
  if (proofUri) {
    formData.append("proof", {
      uri: proofUri,
      name: "proof.jpg",
      type: "image/jpeg",
    });
  }
  const headers = await authHeaders(apiBase, { Accept: "application/json" });
  const res = await fetchWithTimeout(
    `${getApiBase(apiBase)}/api/maintenance/work-orders/${id}/complete`,
    { method: "POST", body: formData, headers },
    90000
  );
  if (res.status === 401) throw new Error("انتهت الجلسة");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "فشل الإنهاء");
  }
  return res.json();
}

export async function fetchNotifications(apiBase, unreadOnly = false) {
  return apiGet(
    `/api/notifications${unreadOnly ? "?unread_only=true" : ""}`,
    apiBase
  );
}

export async function fetchUnreadCount(apiBase) {
  try {
    const data = await apiGet("/api/notifications/unread-count", apiBase);
    return data.unread || 0;
  } catch {
    return 0;
  }
}

export async function markNotificationRead(apiBase, id) {
  const headers = await authHeaders(apiBase, { Accept: "application/json" });
  const res = await fetchWithTimeout(
    `${getApiBase(apiBase)}/api/notifications/${id}/read`,
    { method: "POST", headers },
    15000
  );
  if (!res.ok) throw new Error("Mark read failed");
  return res.json();
}

export async function markAllNotificationsRead(apiBase) {
  const headers = await authHeaders(apiBase, { Accept: "application/json" });
  const res = await fetchWithTimeout(
    `${getApiBase(apiBase)}/api/notifications/read-all`,
    { method: "POST", headers },
    15000
  );
  if (!res.ok) throw new Error("Mark all read failed");
  return res.json();
}

export async function registerPushToken(apiBase, expoToken, platform) {
  const headers = await authHeaders(apiBase, {
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  const res = await fetchWithTimeout(
    `${getApiBase(apiBase)}/api/push/register`,
    { method: "POST", headers, body: JSON.stringify({ expo_token: expoToken, platform }) },
    15000
  );
  if (!res.ok) throw new Error("Push register failed");
  return res.json();
}

export async function fetchTeamMembers(apiBase) {
  return apiGet("/api/team/members", apiBase);
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
