import { useCallback, useRef } from "react";
import { severityLabel } from "../i18n/translations";

function isCriticalDetection(d) {
  if (!d || d.class_name === "photo") return false;
  if (d.severity === "critical" || d.severity === "high") return true;
  return (d.rut_score ?? 0) >= 65;
}

export function useCriticalAlerts({ t, showToast, enabled = true }) {
  const notifiedRef = useRef(new Set());
  const permissionAsked = useRef(false);

  const requestPermission = useCallback(async () => {
    if (!enabled || typeof window === "undefined" || !("Notification" in window)) return;
    if (permissionAsked.current) return;
    permissionAsked.current = true;
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
  }, [enabled]);

  const notifyDetection = useCallback(
    async (d) => {
      if (!enabled || !isCriticalDetection(d)) return;
      if (notifiedRef.current.has(d.id)) return;
      notifiedRef.current.add(d.id);

      const body = (t.criticalAlertBody || "Pothole #{id} — RUT {rut} ({severity})")
        .replace("{id}", String(d.id))
        .replace("{rut}", String(Math.round(d.rut_score ?? 0)))
        .replace("{severity}", severityLabel(t, d.severity || "high"));

      showToast(`⚠️ ${body}`, "warn");

      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          try {
            new Notification(t.criticalAlertTitle || "RUTRIX alert", {
              body,
              tag: `rutrix-det-${d.id}`,
            });
          } catch {
            /* ignore */
          }
        } else if (Notification.permission === "default") {
          await requestPermission();
        }
      }
    },
    [enabled, t, showToast, requestPermission]
  );

  return { notifyDetection, requestPermission, isCriticalDetection };
}

export function countClusterReports(detections, clusterId) {
  if (!clusterId || !Array.isArray(detections)) return 0;
  return detections.filter(
    (d) => d.cluster_id === clusterId && d.class_name !== "photo"
  ).length;
}
