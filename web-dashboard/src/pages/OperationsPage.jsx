import { useLocale } from "../context/LocaleContext";
import ExecutiveDashboard from "../components/ExecutiveDashboard";
import MaintenancePanel from "../components/MaintenancePanel";
import TeamPanel from "../components/TeamPanel";

export default function OperationsPage({
  stats,
  detections,
  selected,
  onSelect,
  maintRefresh,
  onMaintChanged,
  onClearMap,
  clearing,
}) {
  const { t } = useLocale();

  return (
    <div className="page-ops">
      <div className="ops-sections">
        <section className="ops-block">
          <ExecutiveDashboard stats={stats} refreshKey={maintRefresh} />
        </section>

        <section className="ops-block">
          <MaintenancePanel
            detections={detections}
            selected={selected}
            onSelect={onSelect}
            onRefresh={maintRefresh}
            onChanged={onMaintChanged}
          />
        </section>

        <section className="ops-block">
          <TeamPanel />
        </section>

        <section className="ops-block ops-block-danger">
          <h3 className="ops-danger-title">{t.dangerZone}</h3>
          <p className="ops-danger-desc">{t.dangerZoneDesc}</p>
          <button
            type="button"
            className="clear-map-btn"
            onClick={onClearMap}
            disabled={clearing}
          >
            {clearing ? t.clearing : `🗑️ ${t.clearMap}`}
          </button>
        </section>
      </div>
    </div>
  );
}
