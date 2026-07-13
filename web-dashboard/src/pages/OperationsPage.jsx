import ReportExportPanel from "../components/ReportExportPanel";
import ExecutiveDashboard from "../components/ExecutiveDashboard";
import MaintenancePanel from "../components/MaintenancePanel";

export default function OperationsPage({
  stats,
  detections,
  selected,
  onSelect,
  maintRefresh,
  isAdmin = false,
  onMaintChanged,
}) {
  return (
    <div className="page-ops">
      <div className="ops-sections">
        <section className="ops-block">
          <ReportExportPanel />
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
            isAdmin={isAdmin}
            onChanged={onMaintChanged}
          />
        </section>
      </div>
    </div>
  );
}
