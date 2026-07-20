const TERMINAL_WO = new Set(["cancelled", "declined"]);

export function filterMapDetections(detections, workOrders, filters) {
  const { severity = "all", status = "all", type = "all", wo = "all" } = filters || {};
  let list = detections || [];

  if (severity !== "all") {
    list = list.filter((d) => d.severity === severity);
  }
  if (status !== "all") {
    list = list.filter((d) => (d.detection_status || "detected") === status);
  }
  if (type === "potholes") {
    list = list.filter((d) => d.class_name !== "photo");
  } else if (type === "photos") {
    list = list.filter((d) => d.class_name === "photo");
  }

  if (wo !== "all") {
    const activeWoDetIds = new Set(
      (workOrders || [])
        .filter((w) => w.detection_id && !TERMINAL_WO.has(w.status))
        .map((w) => w.detection_id)
    );
    if (wo === "with_wo") {
      list = list.filter((d) => activeWoDetIds.has(d.id));
    } else if (wo === "no_wo") {
      list = list.filter((d) => d.class_name !== "photo" && !activeWoDetIds.has(d.id));
    }
  }

  return list;
}

export const DEFAULT_MAP_FILTERS = {
  severity: "all",
  status: "all",
  type: "all",
  wo: "all",
};
