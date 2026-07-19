import { useCallback, useEffect, useRef, useState } from "react";
import LoginPage from "./components/LoginPage";
import AppShell from "./components/AppShell";
import OverviewPage from "./pages/OverviewPage";
import MapPage from "./pages/MapPage";
import FieldPage from "./pages/FieldPage";
import OperationsPage from "./pages/OperationsPage";
import IntelligencePage from "./pages/IntelligencePage";
import MobilePage from "./pages/MobilePage";
import ProfilePage from "./pages/ProfilePage";
import SupervisorPage from "./pages/SupervisorPage";
import { useAuth } from "./context/AuthContext";
import { useLocale } from "./context/LocaleContext";
import { useCriticalAlerts } from "./hooks/useCriticalAlerts";
import {
  clearMap,
  confirmDetection,
  deleteDetection,
  fetchAllDetections,
  fetchStats,
  fetchApiHealth,
  updateDetectionStatus,
  useWebSocket,
} from "./hooks/useApi";
import { useIsAdmin, useIsOwner } from "./hooks/useIsAdmin";

function Dashboard() {
  const { auth, logout } = useAuth();
  const { t } = useLocale();
  const isAdmin = useIsAdmin();
  const isOwner = useIsOwner();
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

  const { notifyDetection, requestPermission } = useCriticalAlerts({ t, showToast });

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

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

  const loadDetections = useCallback(async () => {
    try {
      const data = await fetchAllDetections();
      const keepId = selectedIdRef.current;
      if (keepId && !data.some((d) => d.id === keepId)) {
        setSelectedId(null);
        selectedSnapshotRef.current = null;
        setSelectedSnapshot(null);
      }
      setDetections(data);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setMaintRefresh((r) => r + 1);
    try {
      const [statsData, persisted] = await Promise.all([fetchStats(), fetchAllDetections()]);
      setStats(statsData);
      setDetections(persisted);
      if (selectedIdRef.current && !persisted.some((d) => d.id === selectedIdRef.current)) {
        setSelectedId(null);
        selectedSnapshotRef.current = null;
        setSelectedSnapshot(null);
      }
      if (statsData?.total_potholes == null) {
        setStaleServer(true);
      } else {
        setStaleServer(false);
      }
    } catch {
      await loadStats();
      await loadDetections();
    }
  }, [loadStats, loadDetections]);

  const handleWsMessage = useCallback(
    (msg) => {
      if (msg.type === "notification") {
        if (!msg.user_id || msg.user_id === auth?.user?.id) {
          const n = msg.data || {};
          showToast(`🔔 ${n.title || ""}${n.body ? " — " + n.body : ""}`, "info");
          setMaintRefresh((r) => r + 1);
        }
        return;
      }
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
        const data = msg.data;
        const mine =
          isOwner ||
          Number(data?.reporter_user_id) === Number(auth?.user?.id);
        if (!mine) return;
        setDetections((prev) => {
          if (prev.some((d) => d.id === data.id)) return prev;
          return [data, ...prev].slice(0, 200);
        });
        if (data.latitude != null) setSelectedId(data.id);
        loadStats();
        void notifyDetection(data);
      }
    },
    [refreshAll, loadStats, notifyDetection, auth?.user?.id, isOwner]
  );

  const handleClearMap = async () => {
    if (!isOwner) {
      window.alert(t.ownerOnlyHint);
      return;
    }
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
    if (!isAdmin) {
      window.alert(t.adminOnlyHint);
      return;
    }
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
      await loadDetections();
      await loadStats();
      showToast(t.confirmSuccess, "success");
    } catch {
      window.alert(t.confirmFail);
    }
  };

  const handleVerify = async (id) => {
    try {
      await updateDetectionStatus(id, "verified");
      await loadDetections();
      await loadStats();
      showToast(t.verifySuccess, "success");
    } catch {
      window.alert(t.confirmFail);
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt(t.rejectReasonPrompt);
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert(t.rejectReasonRequired);
      return;
    }
    if (!window.confirm(t.rejectConfirm)) return;
    try {
      await updateDetectionStatus(id, "rejected", reason.trim());
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
      if (target === "supervisor" && !isOwner) {
        window.alert(t.ownerOnlyHint);
        return;
      }
      setPage(target);
      if (target !== "map" && target !== "supervisor") {
        setBounds(null);
        void loadDetections();
      }
    },
    [loadDetections, isOwner, t.ownerOnlyHint]
  );

  const selectAndShowOnMap = useCallback((id) => {
    setSelectedId(id);
    setPage("map");
  }, []);

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

  const wsConnected = useWebSocket(handleWsMessage);

  useEffect(() => {
    if (page === "supervisor" && !isOwner) {
      setPage("overview");
    }
  }, [page, isOwner]);

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
            onDelete={isAdmin ? handleDelete : undefined}
            deletingId={deletingId}
            isAdmin={isAdmin}
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
            onShowOnMap={selectAndShowOnMap}
            deletingId={deletingId}
            onDelete={isAdmin ? handleDelete : undefined}
            isAdmin={isAdmin}
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
            isAdmin={isAdmin}
            onMaintChanged={() => {
              setMaintRefresh((r) => r + 1);
              loadStats();
            }}
          />
        );
      case "supervisor":
        return (
          <SupervisorPage
            detections={detections}
            selected={selected}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            deletingId={deletingId}
            onClearMap={handleClearMap}
            clearing={clearing}
            onMaintChanged={() => {
              setMaintRefresh((r) => r + 1);
              loadStats();
            }}
            onConfirm={handleConfirm}
            onVerify={handleVerify}
            onReject={handleReject}
            wsConnected={wsConnected}
          />
        );
      case "intel":
        return <IntelligencePage stats={stats} refreshKey={maintRefresh} detections={detections} />;
      case "mobile":
        return <MobilePage />;
      case "profile":
        return <ProfilePage logout={logout} />;
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
        isAdmin={isAdmin}
        isOwner={isOwner}
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
