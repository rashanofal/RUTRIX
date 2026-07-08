import { useLocale } from "../context/LocaleContext";
import NavIcon from "./NavIcons";

const STAT_KEYS = [
  { key: "total", field: "total_detections", labelKey: "statTotal", icon: "inspections", cls: "" },
  { key: "potholes", field: "total_potholes", labelKey: "statPotholes", icon: "pothole", cls: "potholes" },
  { key: "verified", field: "verified_detections", labelKey: "statVerified", icon: "check", cls: "success" },
  { key: "phone", field: "by_device.phone", labelKey: "statPhone", icon: "mobile", cls: "phone" },
];

function getStatValue(stats, field) {
  if (!stats) return 0;
  if (field.includes(".")) {
    const [a, b] = field.split(".");
    return stats?.[a]?.[b] ?? 0;
  }
  return stats[field] ?? 0;
}

export default function StatsGrid({ stats, variant = "default" }) {
  const { t } = useLocale();
  if (!stats) return null;

  const statsKey = `${stats.total_detections}-${stats.total_potholes}-${stats.verified_detections}-${stats.by_device?.phone ?? 0}`;

  return (
    <div className={`stat-grid stat-grid-${variant}`} key={statsKey}>
      {STAT_KEYS.map((s) => (
        <div key={s.key} className={`stat-card ${s.cls}`}>
          <div className="stat-icon">
            <NavIcon name={s.icon} />
          </div>
          <div className="value">{getStatValue(stats, s.field)}</div>
          <div className="label">{t[s.labelKey]}</div>
        </div>
      ))}
    </div>
  );
}
