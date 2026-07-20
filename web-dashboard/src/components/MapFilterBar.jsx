import { useLocale } from "../context/LocaleContext";

const SEVERITY_OPTS = ["all", "critical", "high", "medium", "low"];
const STATUS_OPTS = ["all", "detected", "verified", "rejected"];
const TYPE_OPTS = ["all", "potholes", "photos"];
const WO_OPTS = ["all", "with_wo", "no_wo"];

function SelectRow({ label, value, options, labelKey, onChange, t }) {
  return (
    <label className="map-filter-field">
      <span className="map-filter-label">{label}</span>
      <select
        className="map-filter-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {t[labelKey]?.[opt] ?? opt}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function MapFilterBar({ filters, onChange, resultCount, totalCount }) {
  const { t } = useLocale();
  const set = (key) => (val) => onChange({ ...filters, [key]: val });

  return (
    <div className="map-filter-bar" aria-label={t.mapFilterTitle}>
      <div className="map-filter-head">
        <strong>{t.mapFilterTitle}</strong>
        {totalCount != null ? (
          <span className="map-filter-count">
            {resultCount} / {totalCount}
          </span>
        ) : null}
      </div>
      <div className="map-filter-grid">
        <SelectRow
          label={t.mapFilterSeverity}
          value={filters.severity}
          options={SEVERITY_OPTS}
          labelKey="mapFilterSeverityOpts"
          onChange={set("severity")}
          t={t}
        />
        <SelectRow
          label={t.mapFilterStatus}
          value={filters.status}
          options={STATUS_OPTS}
          labelKey="mapFilterStatusOpts"
          onChange={set("status")}
          t={t}
        />
        <SelectRow
          label={t.mapFilterType}
          value={filters.type}
          options={TYPE_OPTS}
          labelKey="mapFilterTypeOpts"
          onChange={set("type")}
          t={t}
        />
        <SelectRow
          label={t.mapFilterWo}
          value={filters.wo}
          options={WO_OPTS}
          labelKey="mapFilterWoOpts"
          onChange={set("wo")}
          t={t}
        />
      </div>
    </div>
  );
}
