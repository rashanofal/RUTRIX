import { useLocale } from "../context/LocaleContext";
import ReportExportPanel from "../components/ReportExportPanel";
import ExecutiveDashboard from "../components/ExecutiveDashboard";
import MaintenancePanel from "../components/MaintenancePanel";
import AdminPanel from "../components/AdminPanel";

export default function OperationsPage({
  stats,
  detections,
  selected,
  onSelect,
  maintRefresh,
  onMaintChanged,
  onClearMap,
  clearing,
  onDelete,
  deletingId,
}) {
  const { t } = useLocale();

  return (
    <div className="page-ops">
      <div className="ops-sections">
        <section className="ops-block">
          <AdminPanel
            detections={detections}
            onDelete={onDelete}
            deletingId={deletingId}
            onClearMap={onClearMap}
            clearing={clearing}
            onChanged={onMaintChanged}
          />
        </section>

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
          <ReportExportPanel />
        </section>
      </div>
    </div>
  );
}
