function getPageTitle() {
  const titleEl = document.querySelector(".topbar-platform");
  const brandEl = document.querySelector(".topbar-scientific");
  return titleEl?.textContent?.trim() || brandEl?.textContent?.trim() || "RUTRIX";
}

function getPageRoot() {
  return document.querySelector(".app-page > *") || document.querySelector(".app-page");
}

function collectStylesheets() {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => `<link rel="stylesheet" href="${link.href}" />`)
    .join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildDetectionsTable(detections, labels) {
  const rows = (detections || []).filter((d) => d.latitude != null && d.longitude != null);
  if (!rows.length) return "";

  const body = rows
    .map(
      (d) => `<tr>
        <td>#${d.id}</td>
        <td>${d.latitude.toFixed(5)}, ${d.longitude.toFixed(5)}</td>
        <td>${escapeHtml(d.severity || "—")}</td>
        <td>${d.rut_score ?? 0}</td>
        <td>${escapeHtml(d.anomaly_type || d.class_name || "—")}</td>
        <td>${escapeHtml(d.detection_status || "—")}</td>
        <td>${escapeHtml(d.reporter_name || "—")}</td>
      </tr>`
    )
    .join("");

  return `<section class="page-export-table-wrap">
    <h2>${escapeHtml(labels.pointsTitle)} (${rows.length})</h2>
    <table class="page-export-table">
      <thead>
        <tr>
          <th>${escapeHtml(labels.id)}</th>
          <th>${escapeHtml(labels.coords)}</th>
          <th>${escapeHtml(labels.severity)}</th>
          <th>${escapeHtml(labels.rut)}</th>
          <th>${escapeHtml(labels.type)}</th>
          <th>${escapeHtml(labels.status)}</th>
          <th>${escapeHtml(labels.reporter)}</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </section>`;
}

function prepareClone(root) {
  const clone = root.cloneNode(true);
  clone.querySelectorAll(".page-export-toolbar, .report-export-toolbar, .map-drawer-close, .no-export").forEach((el) => {
    el.remove();
  });
  clone.querySelectorAll("button, select, textarea, input").forEach((el) => {
    if (el.tagName === "INPUT" && (el.type === "hidden" || el.type === "file")) return;
    el.remove();
  });
  return clone;
}

export function buildPageHtmlDocument({ forPrint = false, exportContext = null } = {}) {
  const root = getPageRoot();
  if (!root) throw new Error("page_not_found");

  const title = getPageTitle();
  const dir = document.documentElement.getAttribute("dir") || "rtl";
  const generatedAt = new Date().toLocaleString();
  const clone = prepareClone(root);
  const extraTable =
    exportContext?.detections?.length && exportContext?.labels
      ? buildDetectionsTable(exportContext.detections, exportContext.labels)
      : "";

  const printHook = forPrint
    ? `<script>
        window.addEventListener("load", function () {
          setTimeout(function () { window.focus(); window.print(); }, 450);
        });
      </script>`
    : "";

  return `<!DOCTYPE html>
<html lang="${document.documentElement.lang || "ar"}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — RUTRIX</title>
  ${collectStylesheets()}
  <style>
    body { background: #fff; color: #111; margin: 0; padding: 1.25rem; font-family: system-ui, sans-serif; }
    .page-export-head { margin-bottom: 1rem; border-bottom: 1px solid #ddd; padding-bottom: 0.75rem; }
    .page-export-meta { color: #555; font-size: 0.9rem; margin: 0.25rem 0 0; }
    .page-export-table-wrap { margin-top: 1.25rem; break-inside: avoid; }
    .page-export-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .page-export-table th, .page-export-table td { border: 1px solid #ccc; padding: 0.35rem 0.5rem; text-align: start; }
    .page-export-table th { background: #f3f4f6; }
    .leaflet-container { height: 420px !important; min-height: 320px !important; }
    @media print {
      body { padding: 0.5rem; }
      .leaflet-control-container { display: none !important; }
    }
  </style>
</head>
<body>
  <header class="page-export-head">
    <h1>${escapeHtml(title)}</h1>
    <p class="page-export-meta">RUTRIX · ${escapeHtml(generatedAt)}</p>
  </header>
  ${clone.outerHTML}
  ${extraTable}
  ${printHook}
</body>
</html>`;
}

function openHtmlBlob(html, { print = false } = {}) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) throw new Error("popup_blocked");
  setTimeout(() => URL.revokeObjectURL(url), print ? 180_000 : 60_000);
}

export function printCurrentPage(exportContext = null) {
  const prevTitle = document.title;
  document.title = getPageTitle();
  document.body.classList.add("printing-page");

  let tableHost = null;
  if (exportContext?.detections?.length && exportContext?.labels) {
    tableHost = document.getElementById("page-export-print-table");
    if (!tableHost) {
      tableHost = document.createElement("div");
      tableHost.id = "page-export-print-table";
      tableHost.className = "page-export-print-table no-export";
      document.querySelector(".app-page")?.appendChild(tableHost);
    }
    tableHost.innerHTML = buildDetectionsTable(exportContext.detections, exportContext.labels);
  }

  const cleanup = () => {
    tableHost?.remove();
    document.body.classList.remove("printing-page");
    document.title = prevTitle;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  setTimeout(() => {
    window.focus();
    window.print();
  }, 150);
}

export function openPageHtml(exportContext = null) {
  const html = buildPageHtmlDocument({ exportContext });
  openHtmlBlob(html);
}

export function openPagePdf(exportContext = null) {
  const html = buildPageHtmlDocument({ forPrint: true, exportContext });
  openHtmlBlob(html, { print: true });
}
