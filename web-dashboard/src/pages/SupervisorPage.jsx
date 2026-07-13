import { useLocale } from "../context/LocaleContext";
import { useIsOwner } from "../hooks/useIsAdmin";
import PotholeMap from "../components/PotholeMap";
import DetectionDetail from "../components/DetectionDetail";
import AdminPanel from "../components/AdminPanel";

export default function SupervisorPage({
  detections,
  selected,
  selectedId,
  onSelect,
  onDelete,
  deletingId,
  onClearMap,
  clearing,
  onMaintChanged,
  onConfirm,
  onVerify,
  onReject,
  wsConnected,
}) {
  const { t } = useLocale();
  const isOwner = useIsOwner();

  if (!isOwner) {
    return (
      <div className="page-supervisor page-supervisor-locked">
        <div className="supervisor-locked-card">
          <span className="supervisor-locked-icon" aria-hidden>
            🛡️
          </span>
          <h2>{t.adminPanelTitle}</h2>
          <p>{t.ownerOnlyHint}</p>
        </div>
      </div>
    );
  }

  const pinned = detections.filter((d) => d.latitude != null && d.longitude != null).length;
  const reporters = new Set(
    detections.map((d) => d.reporter_name).filter(Boolean)
  ).size;

  return (
    <div className="page-supervisor">
      <header className="supervisor-hero">
        <div className="supervisor-hero-text">
          <h2 className="supervisor-title">{t.adminPanelTitle}</h2>
        </div>
        <div className="supervisor-kpis">
          <article className="supervisor-kpi">
            <span className="supervisor-kpi-value">{pinned}</span>
            <span className="supervisor-kpi-label">{t.supervisorKpiPins}</span>
          </article>
          <article className="supervisor-kpi">
            <span className="supervisor-kpi-value">{reporters || "—"}</span>
            <span className="supervisor-kpi-label">{t.supervisorKpiReporters}</span>
          </article>
          <article className="supervisor-kpi">
            <span className="supervisor-kpi-value">{detections.length}</span>
            <span className="supervisor-kpi-label">{t.supervisorKpiRecords}</span>
          </article>
          <span className={`supervisor-live ${wsConnected ? "on" : "off"}`}>
            <span className="supervisor-live-dot" />
            {wsConnected ? t.supervisorLiveOn : t.disconnected}
          </span>
        </div>
      </header>

      <section className="supervisor-map-section" aria-label={t.supervisorMapTitle}>
        <div className="supervisor-map-frame">
          <PotholeMap
            detections={detections}
            selectedId={selectedId}
            onSelect={onSelect}
            onDelete={onDelete}
            deletingId={deletingId}
            refitOnChange
            showReporter
          />
        </div>
        {selectedId && selected ? (
          <aside className="supervisor-map-drawer" aria-label={t.recent}>
            <button
              type="button"
              className="map-drawer-close"
              onClick={() => onSelect(null)}
              aria-label="Close"
            >
              ✕
            </button>
            <DetectionDetail
              selected={selected}
              detections={detections}
              deletingId={deletingId}
              onDelete={onDelete}
              onConfirm={onConfirm}
              onVerify={onVerify}
              onReject={onReject}
            />
          </aside>
        ) : null}
      </section>

      <AdminPanel
        detections={detections}
        onDelete={onDelete}
        deletingId={deletingId}
        onClearMap={onClearMap}
        clearing={clearing}
        onChanged={onMaintChanged}
        embedded
      />
    </div>
  );
}
