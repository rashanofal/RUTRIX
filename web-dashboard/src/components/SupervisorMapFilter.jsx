import { useMemo } from "react";
import { useLocale } from "../context/LocaleContext";

export default function SupervisorMapFilter({ members = [], detections = [], value, onChange }) {
  const { t } = useLocale();

  const options = useMemo(() => {
    const labels = new Map();
    const counts = new Map();
    for (const m of members) {
      labels.set(m.user_id, m.full_name);
    }
    for (const d of detections) {
      if (d.latitude == null || d.longitude == null || !d.reporter_user_id) continue;
      counts.set(d.reporter_user_id, (counts.get(d.reporter_user_id) || 0) + 1);
      if (!labels.has(d.reporter_user_id)) {
        labels.set(d.reporter_user_id, d.reporter_name || `#${d.reporter_user_id}`);
      }
    }
    return [...labels.keys()]
      .map((user_id) => ({
        user_id,
        label: labels.get(user_id),
        count: counts.get(user_id) || 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [members, detections]);

  return (
    <div className="supervisor-map-filter" role="group" aria-label={t.supervisorFilterTitle}>
      <span className="supervisor-map-filter-label">{t.supervisorFilterTitle}</span>
      <div className="supervisor-map-filter-chips">
        <button
          type="button"
          className={`supervisor-filter-chip${value == null ? " active" : ""}`}
          onClick={() => onChange(null)}
        >
          {t.supervisorFilterAll}
        </button>
        {options.map((opt) => (
          <button
            key={opt.user_id}
            type="button"
            className={`supervisor-filter-chip${value === opt.user_id ? " active" : ""}`}
            onClick={() => onChange(opt.user_id)}
          >
            <span>{opt.label}</span>
            <span className="supervisor-filter-chip-count" dir="ltr">
              {opt.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
