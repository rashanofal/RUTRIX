import { useCallback, useEffect, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { fetchAuditLog } from "../hooks/useApi";

function formatAction(action, t) {
  return t.auditActions?.[action] || action;
}

function formatWhen(iso, locale) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "ar-EG", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function AuditLogPanel({ refreshKey = 0 }) {
  const { t, locale } = useLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchAuditLog(80)
      .then(setRows)
      .catch((e) => {
        setRows([]);
        setError(e.message || t.auditEmpty);
      })
      .finally(() => setLoading(false));
  }, [t.auditEmpty]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <section className="audit-log-panel section-card">
      <div className="section-label">
        <span className="section-label-icon">📜</span>
        <span>{t.auditTitle}</span>
      </div>
      <p className="intel-sub">{t.auditSub}</p>

      {loading ? <p className="intel-empty">{t.loading}</p> : null}
      {!loading && error ? <p className="intel-empty">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="intel-empty">{t.auditEmpty}</p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="audit-log-table-wrap">
          <table className="audit-log-table">
            <thead>
              <tr>
                <th>{t.auditTime}</th>
                <th>{t.auditUser}</th>
                <th>{t.auditAction}</th>
                <th>{t.auditEntity}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{formatWhen(row.created_at, locale)}</td>
                  <td>{row.user_name || "—"}</td>
                  <td>{formatAction(row.action, t)}</td>
                  <td>
                    {row.entity_type}
                    {row.entity_id != null ? ` #${row.entity_id}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <button type="button" className="audit-refresh-btn" onClick={load} disabled={loading}>
        {t.auditRefresh}
      </button>
    </section>
  );
}
