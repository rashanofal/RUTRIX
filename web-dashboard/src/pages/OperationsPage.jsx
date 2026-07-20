import ReportExportPanel from "../components/ReportExportPanel";
import ExecutiveDashboard from "../components/ExecutiveDashboard";
import MaintenancePanel from "../components/MaintenancePanel";
import PageExportToolbar from "../components/PageExportToolbar";
import AuditLogPanel from "../components/AuditLogPanel";

export default function OperationsPage({
  stats,
  detections,
  selected,
  onSelect,
  maintRefresh,
  isAdmin = false,
  isSupervisor = false,
  onMaintChanged,
}) {
  return (
    <div className="page-ops">
      <div className="ops-sections">
        <section className="ops-block">
          <ReportExportPanel />
        </section>

        <section className="ops-block">
          <PageExportToolbar variant="compact" exportContext={{ detections }} />
        </section>

        <section className="ops-block">
          <ExecutiveDashboard stats={stats} refreshKey={maintRefresh} />
        </section>

        {isSupervisor ? (
          <section className="ops-block">
            <AuditLogPanel refreshKey={maintRefresh} />
          </section>
        ) : null}

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
