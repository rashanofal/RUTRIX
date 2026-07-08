import { useCallback, useEffect, useRef, useState } from "react";
import LoginPage from "./components/LoginPage";
import AppShell from "./components/AppShell";
import OverviewPage from "./pages/OverviewPage";
import MapPage from "./pages/MapPage";
import FieldPage from "./pages/FieldPage";
import OperationsPage from "./pages/OperationsPage";
import IntelligencePage from "./pages/IntelligencePage";
import MobilePage from "./pages/MobilePage";
import { useAuth } from "./context/AuthContext";
import { useLocale } from "./context/LocaleContext";
import {
  clearMap,
  confirmDetection,
  deleteDetection,
  fetchInBounds,
  fetchRecent,
  fetchStats,
  fetchApiHealth,
  updateDetectionStatus,
  useWebSocket,
} from "./hooks/useApi";

function Dashboard() {
  const { auth, logout } = useAuth();
  const { t } = useLocale();
  const [page, setPage] = useState("overview");
  const [detections, setDetections] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const selectedIdRef = useRef(selectedId);
  const selectedSnapshotRef = useRef(null);
  selectedIdRef.current = selectedId;
  const [bounds, setBounds] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [maintRefresh, setMaintRefresh] = useState(0);
  const [staleServer, setStaleServer] = useState(false);

  const showToast = (message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4200);
  };

  const selected = detections.find((d) => d.id === selectedId) ?? selectedSnapshot;

  useEffect(() => {
    if (!selectedId) {
      selectedSnapshotRef.current = null;
      setSelectedSnapshot(null);
      return;
    }
    const found = detections.find((d) => d.id === selectedId);
    if (found) {
      selectedSnapshotRef.current = found;
      setSelectedSnapshot(found);
    }
  }, [detections, selectedId]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await fetchStats());
    } catch {
      /* offline */
    }
  }, []);

  const loadDetections = useCallback(async (b) => {
    try {
      const data = b ? await fetchInBounds(b) : await fetchRecent(100);
      const keepId = selectedIdRef.current;
      if (b && keepId && !data.some((d) => d.id === keepId)) {
        const cached = selectedSnapshotRef.current;
        if (cached?.id === keepId) {
          setDetections([cached, ...data]);
          return;
        }
      }
      setDetections(data);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setMaintRefresh((r) => r + 1);
    try {
      const [statsData, recent] = await Promise.all([fetchStats(), fetchRecent(100)]);
      setStats(statsData);
      setDetections(recent);
      if (statsData?.total_potholes == null) {
        setStaleServer(true);
      } else {
        setStaleServer(false);
      }
    } catch {
      await loadStats();
      await loadDetections(null);
    }
  }, [loadStats, loadDetections]);

  const handleWsMessage = useCallback(
    (msg) => {
      if (msg.type === "map_cleared") {
        setDetections([]);
        setSelectedId(null);
        setMaintRefresh((r) => r + 1);
        loadStats();
        return;
      }
      if (msg.type === "detections_deleted") {
        const ids = new Set(msg.data?.ids || []);
        setDetections((prev) => prev.filter((d) => !ids.has(d.id)));
        setSelectedId((cur) => (cur && ids.has(cur) ? null : cur));
        refreshAll();
        return;
      }
      if (msg.type === "detection_deleted") {
        const id = msg.data?.id;
        setDetections((prev) => prev.filter((d) => d.id !== id));
        setSelectedId((cur) => (cur === id ? null : cur));
        refreshAll();
        return;
      }
      if (msg.type === "detection_updated") {
        const data = msg.data;
        setDetections((prev) => prev.map((d) => (d.id === data.id ? { ...d, ...data } : d)));
        loadStats();
        return;
      }
      if (msg.type === "new_detection") {
        setDetections((prev) => {
          if (prev.some((d) => d.id === msg.data.id)) return prev;
          return [msg.data, ...prev].slice(0, 200);
        });
        if (msg.data.latitude != null) setSelectedId(msg.data.id);
        loadStats();
      }
    },
    [refreshAll, loadStats]
  );

  const handleClearMap = async () => {
    if (!window.confirm(t.clearConfirm)) return;
    setClearing(true);
    try {
      await clearMap();
      setDetections([]);
      setSelectedId(null);
      setMaintRefresh((r) => r + 1);
      await loadStats();
    } catch {
      window.alert(t.clearFail);
    } finally {
      setClearing(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t.deleteConfirm)) return;
    setDeletingId(id);
    try {
      const result = await deleteDetection(id);
      const ids = new Set(result?.deleted_ids || [id]);
      setDetections((prev) => prev.filter((d) => !ids.has(d.id)));
      setSelectedId((cur) => (cur && ids.has(cur) ? null : cur));
      await refreshAll();
      const n = result?.deleted_count || 1;
      showToast(n > 1 ? t.deleteSuccessMany.replace("{n}", String(n)) : t.deleteSuccess, "success");
    } catch (err) {
      const msg =
        err?.message === "ROUTE_OR_DETECTION_NOT_FOUND"
          ? `${t.deleteFail}\n${t.deleteFailHint}`
          : t.deleteFail;
      window.alert(msg);
    } finally {
      setDeletingId(null);
    }
  };

  const handleConfirm = async (id) => {
    try {
      await confirmDetection(id);
      await loadDetections(bounds);
      await loadStats();
      showToast(t.confirmSuccess, "success");
    } catch {
      window.alert(t.confirmFail);
    }
  };

  const handleVerify = async (id) => {
    try {
      await updateDetectionStatus(id, "verified");
      await loadDetections(bounds);
      await loadStats();
      showToast(t.verifySuccess, "success");
    } catch {
      window.alert(t.confirmFail);
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm(t.rejectConfirm)) return;
    try {
      await updateDetectionStatus(id, "rejected");
      setDetections((prev) => prev.filter((d) => d.id !== id));
      setSelectedId(null);
      await refreshAll();
    } catch {
      window.alert(t.confirmFail);
    }
  };

  const handleUploaded = () => {
    refreshAll();
  };

  const handleNavigate = useCallback(
    (target) => {
      setPage(target);
      if (target !== "map") {
        setBounds(null);
        void loadDetections(null);
      }
    },
    [loadDetections]
  );

  const handleBoundsChange = useCallback((b) => {
    setBounds(b);
  }, []);

  useEffect(() => {
    refreshAll();
    fetchApiHealth()
      .then((h) => {
        if (!h?.features?.unique_inspection_stats) setStaleServer(true);
      })
      .catch(() => {});
    const timer = setInterval(() => loadStats(), 30_000);
    const onFocus = () => refreshAll();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshAll, loadStats]);

  useEffect(() => {
    if (page !== "map" || !bounds) return;
    loadDetections(bounds);
  }, [page, bounds, loadDetections]);

  const wsConnected = useWebSocket(handleWsMessage);

  const renderPage = () => {
    switch (page) {
      case "overview":
        return (
          <OverviewPage
            detections={detections}
            onNavigate={handleNavigate}
          />
        );
      case "map":
        return (
          <MapPage
            detections={detections}
            selected={selected}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onBoundsChange={handleBoundsChange}
            onDelete={handleDelete}
            deletingId={deletingId}
            onConfirm={handleConfirm}
            onVerify={handleVerify}
            onReject={handleReject}
            wsConnected={wsConnected}
          />
        );
      case "field":
        return (
          <FieldPage
            stats={stats}
            detections={detections}
            selected={selected}
            selectedId={selectedId}
            onSelect={setSelectedId}
            deletingId={deletingId}
            onDelete={handleDelete}
            onConfirm={handleConfirm}
            onVerify={handleVerify}
            onReject={handleReject}
            onUploaded={handleUploaded}
          />
        );
      case "ops":
        return (
          <OperationsPage
            stats={stats}
            detections={detections}
            selected={selected}
            onSelect={setSelectedId}
            maintRefresh={maintRefresh}
            onMaintChanged={() => {
              setMaintRefresh((r) => r + 1);
              loadStats();
            }}
            onClearMap={handleClearMap}
            clearing={clearing}
          />
        );
      case "intel":
        return <IntelligencePage stats={stats} refreshKey={maintRefresh} detections={detections} />;
      case "mobile":
        return <MobilePage />;
      default:
        return null;
    }
  };

  return (
    <>
      {staleServer && (
        <div className="app-stale-banner" role="alert">
          ⚠️ {t.staleServer}
        </div>
      )}
      {toast && (
        <div className={`app-toast app-toast-${toast.type}`} role="status">
          {toast.message}
        </div>
      )}
      <AppShell
        page={page}
        onNavigate={handleNavigate}
        auth={auth}
        logout={logout}
        wsConnected={wsConnected}
      >
        {renderPage()}
      </AppShell>
    </>
  );
}

export default function App() {
  const { auth, loading } = useAuth();
  const { t } = useLocale();

  if (loading) {
    return (
      <div className="login-page">
        <p className="loading-text">{t.loading}</p>
      </div>
    );
  }

  if (!auth) return <LoginPage />;
  return <Dashboard />;
}
