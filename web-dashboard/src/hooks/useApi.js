import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "../context/AuthContext";

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/detections`;

function authHeaders(extra = {}) {
  const token = getAccessToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  if (res.status === 401) {
    localStorage.removeItem("pothole_auth");
    throw new Error("انتهت الجلسة — سجّل الدخول مرة أخرى");
  }
  return res;
}

export function useWebSocket(onMessage) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return undefined;

    let ws;
    let retryTimer;

    function connect() {
      const url = `${WS_URL}?token=${encodeURIComponent(token)}`;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        retryTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current(data);
        } catch {
          /* ignore */
        }
      };
    }

    connect();
    return () => {
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  return connected;
}

export async function clearMap() {
  const res = await apiFetch("/api/detections/clear", { method: "DELETE" });
  if (!res.ok) throw new Error("فشل مسح الخريطة");
  return res.json();
}

export async function deleteDetection(id) {
  const res = await apiFetch(`/api/detections/${id}`, { method: "DELETE" });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : "";
    } catch {
      /* ignore */
    }
    if (res.status === 404) {
      throw new Error(detail || "ROUTE_OR_DETECTION_NOT_FOUND");
    }
    throw new Error(detail || `HTTP_${res.status}`);
  }
  return res.json();
}

export async function fetchStats() {
  const res = await apiFetch(`/api/detections/stats?_=${Date.now()}`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function fetchApiHealth() {
  const res = await fetch(`/api/health?_=${Date.now()}`);
  if (!res.ok) throw new Error("health failed");
  return res.json();
}

export async function fetchRecent(limit = 50) {
  const res = await apiFetch(`/api/detections/recent?limit=${limit}&_=${Date.now()}`);
  if (!res.ok) throw new Error("Failed to fetch detections");
  return res.json();
}

export async function fetchAllDetections() {
  const pageSize = 1000;
  const all = [];
  for (let offset = 0; ; offset += pageSize) {
    const res = await apiFetch(
      `/api/detections/all?limit=${pageSize}&offset=${offset}&_=${Date.now()}`
    );
    if (!res.ok) throw new Error("Failed to fetch all detections");
    const page = await res.json();
    all.push(...page);
    if (page.length < pageSize) return all;
  }
}

export async function fetchInBounds(bounds) {
  const { south, west, north, east } = bounds;
  const params = new URLSearchParams({
    min_lat: south,
    min_lon: west,
    max_lat: north,
    max_lon: east,
    _: String(Date.now()),
  });
  const res = await apiFetch(`/api/detections?${params}`);
  if (!res.ok) throw new Error("Failed to fetch bounds");
  return res.json();
}

export async function fetchPriorities(limit = 30) {
  const res = await apiFetch(`/api/intelligence/priorities?limit=${limit}&_=${Date.now()}`);
  if (!res.ok) throw new Error("Failed priorities");
  return res.json();
}

export async function fetchLeaderboard(limit = 15) {
  const res = await apiFetch(`/api/intelligence/leaderboard?limit=${limit}`);
  if (!res.ok) throw new Error("Failed leaderboard");
  return res.json();
}

export async function fetchRoadQuality() {
  const res = await apiFetch(`/api/intelligence/road-quality?_=${Date.now()}`);
  if (!res.ok) throw new Error("Failed road quality");
  return res.json();
}

export async function fetchRoadBearings(points) {
  const res = await apiFetch("/api/intelligence/road-bearings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) throw new Error("Failed road bearings");
  const data = await res.json();
  return data.bearings || {};
}

export async function confirmDetection(id) {
  const res = await apiFetch(`/api/intelligence/confirm/${id}`, { method: "POST" });
  if (!res.ok) throw new Error("Confirm failed");
  return res.json();
}

export async function updateDetectionStatus(id, detection_status) {
  const res = await apiFetch(`/api/detections/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ detection_status }),
  });
  if (!res.ok) throw new Error("Status update failed");
  return res.json();
}

export async function fetchMaintenanceDashboard() {
  const res = await apiFetch(`/api/maintenance/dashboard?_=${Date.now()}`);
  if (!res.ok) throw new Error("Failed dashboard");
  return res.json();
}

export async function fetchWorkOrders(status) {
  const q = status ? `?status=${status}&_=${Date.now()}` : `?_=${Date.now()}`;
  const res = await apiFetch(`/api/maintenance/work-orders${q}`);
  if (!res.ok) throw new Error("Failed work orders");
  return res.json();
}

export async function createWorkOrder(data) {
  const res = await apiFetch("/api/maintenance/work-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.detail || "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || "Create work order failed");
  }
  return res.json();
}

async function readApiError(res, fallback) {
  let detail = "";
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") detail = body.detail;
    else if (Array.isArray(body?.detail)) {
      detail = body.detail.map((d) => d.msg || String(d)).join("; ");
    }
  } catch {
    /* ignore */
  }
  throw new Error(detail || fallback);
}

export async function updateWorkOrder(id, data) {
  const res = await apiFetch(`/api/maintenance/work-orders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) await readApiError(res, "Update work order failed");
  return res.json();
}

export async function verifyWorkOrder(id) {
  const res = await apiFetch(`/api/maintenance/work-orders/${id}/verify`, {
    method: "POST",
  });
  if (!res.ok) await readApiError(res, "Verify work order failed");
  return res.json();
}

export async function fetchTeamMembers() {
  const res = await apiFetch("/api/team/members");
  if (!res.ok) throw new Error("Failed team");
  return res.json();
}

export async function inviteTeamMember(data) {
  const res = await apiFetch("/api/team/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Invite failed");
  return res.json();
}

export async function removeTeamMember(userId) {
  const res = await apiFetch(`/api/team/members/${userId}`, { method: "DELETE" });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.detail || "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || "Remove member failed");
  }
  return res.json();
}

export async function resetTeamMemberPassword(userId, new_password) {
  const res = await apiFetch(`/api/team/members/${userId}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_password }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.detail || "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || "Reset password failed");
  }
  return res.json();
}

export async function fetchRouteQuality(fromLat, fromLon, toLat, toLon) {
  const params = new URLSearchParams({
    from_lat: fromLat,
    from_lon: fromLon,
    to_lat: toLat,
    to_lon: toLon,
  });
  const res = await apiFetch(`/api/intelligence/route-quality?${params}`);
  if (!res.ok) throw new Error("Route quality failed");
  return res.json();
}

export async function openReportHtml() {
  const res = await apiFetch("/api/intelligence/report/html");
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(detail || `فشل تحميل HTML (HTTP ${res.status})`);
  }
  const html = await res.text();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export async function openReportPdf() {
  const res = await apiFetch("/api/intelligence/report/pdf");
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(detail || `فشل تحميل PDF (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  if (!blob.size || blob.size < 100) {
    throw new Error("ملف PDF فارغ — أعد تشغيل START.bat");
  }
  const header = await blob.slice(0, 4).text();
  if (!header.startsWith("%PDF")) {
    throw new Error("الملف المُحمّل ليس PDF صالحاً — جرّب تقرير HTML");
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rutrix-report.pdf";
  a.click();
  URL.revokeObjectURL(url);
}

export { apiFetch };
