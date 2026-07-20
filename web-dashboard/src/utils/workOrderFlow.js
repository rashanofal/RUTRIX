const CLOSED_WO = new Set(["verified", "cancelled", "declined"]);

/** Prefer active work order linked to a detection, else most recent. */
export function workOrderForDetection(workOrders, detectionId) {
  if (!detectionId || !workOrders?.length) return null;
  const linked = workOrders.filter((w) => w.detection_id === detectionId);
  if (!linked.length) return null;
  const active = linked.find((w) => w.status && !CLOSED_WO.has(w.status));
  if (active) return active;
  return [...linked].sort((a, b) => (b.id || 0) - (a.id || 0))[0];
}

/** Unified pipeline step index for detection + optional work order. */
export function pipelineStepIndex(detection, workOrder) {
  if (!detection || detection.class_name === "photo") return -1;
  if (detection.detection_status === "rejected") return -1;

  if (!workOrder || CLOSED_WO.has(workOrder.status)) {
    return detection.detection_status === "verified" ? 1 : 0;
  }

  switch (workOrder.status) {
    case "verified":
      return 5;
    case "completed":
      return 4;
    case "in_progress":
    case "accepted":
      return 3;
    case "assigned":
    case "open":
      return 2;
    default:
      return detection.detection_status === "verified" ? 1 : 0;
  }
}

export const UNIFIED_FLOW_STEPS = [
  "detected",
  "verified",
  "wo_open",
  "wo_field",
  "wo_review",
  "wo_closed",
];
