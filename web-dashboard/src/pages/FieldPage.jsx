import { useLocale } from "../context/LocaleContext";
import UploadPanel from "../components/UploadPanel";
import DetectionList from "../components/DetectionList";
import DetectionDetail from "../components/DetectionDetail";
import StatsGrid from "../components/StatsGrid";

export default function FieldPage({
  stats,
  detections,
  selected,
  selectedId,
  onSelect,
  deletingId,
  onDelete,
  onConfirm,
  onVerify,
  onReject,
  onUploaded,
}) {
  const { t } = useLocale();

  return (
    <div className="page-field">
      <div className="field-dashboard-head">
        <div>
          <h2 className="field-dashboard-title">{t.dashboardPanelTitle}</h2>
          <p className="field-dashboard-sub">{t.dashboardPanelSub}</p>
        </div>
      </div>

      <StatsGrid stats={stats} variant="hero" />

      <div className="field-layout">
        <div className="field-col field-col-upload">
          <div className="section-card">
            <UploadPanel onUploaded={onUploaded} />
          </div>

          <div className="legend-row legend-row-spread">
            <span className="legend-chip"><span className="legend-dot blue" /> {t.legendPhoto}</span>
            <span className="legend-chip"><span className="legend-dot red" /> {t.legendPothole}</span>
            <span className="legend-chip"><span className="legend-dot green" /> {t.legendVerified}</span>
          </div>

          {selected && (
            <DetectionDetail
              selected={selected}
              detections={detections}
              deletingId={deletingId}
              onDelete={onDelete}
              onConfirm={onConfirm}
              onVerify={onVerify}
              onReject={onReject}
            />
          )}
        </div>

        <div className="field-col field-col-list">
          <DetectionList
            detections={detections}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
      </div>
    </div>
  );
}

