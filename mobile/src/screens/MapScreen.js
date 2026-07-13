import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { fetchRecent, imageUrl, deleteDetection, confirmDetection } from "../api";
import { getStoredAuth } from "../auth";
import { useLocale } from "../LocaleContext";
import ScreenHeader from "../components/ScreenHeader";
import { colors, radius, spacing } from "../theme";

const CAIRO = { latitude: 30.0444, longitude: 31.2357 };
const PLATFORM_OWNER_EMAIL = "rashanofal82@gmail.com";

function isPlatformOwner(auth) {
  const email = auth?.user?.email?.trim()?.toLowerCase();
  return email === PLATFORM_OWNER_EMAIL;
}

function groupDetectionsForMap(detections) {
  const groups = new Map();
  const SEV_RANK = { low: 1, medium: 2, high: 3, critical: 4 };
  for (const d of detections || []) {
    if (d.latitude == null || d.longitude == null) continue;
    if (d.location_status === "uncertain") continue;
    const key = d.image_path || d.image_url || `id:${d.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }

  return [...groups.values()].map((items) => {
    const holes = items.filter((x) => x.class_name !== "photo");
    const representatives = holes.length ? holes : items;
    const representative = [...representatives].sort((a, b) => {
      const sev = (SEV_RANK[b.severity] || 0) - (SEV_RANK[a.severity] || 0);
      if (sev) return sev;
      return (b.rut_score || 0) - (a.rut_score || 0) || (b.confidence || 0) - (a.confidence || 0);
    })[0];
    return {
      ...representative,
      pothole_count: holes.length,
      group_ids: items.map((x) => x.id),
    };
  });
}

function pinColor(item) {
  if ((item.pothole_count ?? (item.class_name === "photo" ? 0 : 1)) === 0) return colors.primary;
  const sev = item.severity || "medium";
  if (sev === "critical") return "#f97316";
  if (sev === "high") return colors.danger;
  if (sev === "medium") return colors.warning;
  return colors.success;
}

export default function MapScreen({ apiUrl, refreshKey, onBell, unreadCount }) {
  const { t, locale } = useLocale();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [ownerView, setOwnerView] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const auth = await getStoredAuth();
      setOwnerView(isPlatformOwner(auth));
      const data = await fetchRecent(apiUrl, 150);
      setItems(groupDetectionsForMap(data));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleConfirm = async () => {
    if (!selected) return;
    try {
      const res = await confirmDetection(apiUrl, selected.id);
      Alert.alert(t.success, `${t.confirmed} +${res.points_awarded} ${t.pointsLabel}`);
      await load();
      setSelected({
        ...selected,
        confirmation_count: res.confirmation_count,
        rut_score: res.rut_score,
      });
    } catch {
      Alert.alert("", t.confirmFail);
    }
  };

  const handleDelete = () => {
    if (!selected) return;
    Alert.alert(t.delete, t.deleteConfirm, [
      { text: locale === "ar" ? "إلغاء" : "Cancel", style: "cancel" },
      {
        text: t.delete,
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteDetection(apiUrl, selected.id);
            setSelected(null);
            await load();
          } catch {
            Alert.alert("", t.deleteFail);
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const initial = items[0]
    ? { latitude: items[0].latitude, longitude: items[0].longitude }
    : CAIRO;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t.mapTitle}
        subtitle={ownerView ? t.mapScopeOwner : t.mapScopeMine}
        onAction={load}
        onBell={onBell}
        unreadCount={unreadCount}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <MapView
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={{ ...initial, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
        >
          <UrlTile
            urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maximumZ={19}
            flipY={false}
          />
          {items.map((d) => (
            <Marker
              key={d.id}
              coordinate={{ latitude: d.latitude, longitude: d.longitude }}
              pinColor={pinColor(d)}
              onPress={() => setSelected(d)}
            />
          ))}
        </MapView>
      )}

      <LinearGradient colors={["transparent", colors.bgSoft]} style={styles.legendWrap}>
        <View style={styles.legend}>
          <LegendDot color={colors.primary} label={t.photo} />
          <LegendDot color={colors.danger} label={t.pothole} />
          <LegendDot color={colors.success} label={t.verified} />
          <Text style={styles.count}>
            {items.length} {t.points}
          </Text>
        </View>
      </LinearGradient>

      <Modal visible={!!selected} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <TouchableOpacity style={styles.close} onPress={() => setSelected(null)}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
            {selected && (
              <ScrollView>
                <Text style={styles.modalTitle}>
                  {(selected.pothole_count ?? 0) === 0
                    ? t.photo
                    : (selected.pothole_count || 0) > 1
                      ? `${selected.pothole_count} ${t.pothole}`
                      : `${t.pothole} #${selected.id}`}
                </Text>
                {ownerView && selected.reporter_name ? (
                  <Text style={styles.meta}>
                    {t.reportedBy}: {selected.reporter_name}
                  </Text>
                ) : null}
                {selected.image_url && (
                  <Image
                    source={{ uri: imageUrl(apiUrl, selected.image_url) }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                )}
                {selected.class_name !== "photo" && (
                  <>
                    <Text style={styles.conf}>
                      RUT {selected.rut_score ?? 0} · {t.severity}: {selected.severity}
                    </Text>
                    <Text style={styles.conf}>
                      {t.confidence}: {(selected.confidence * 100).toFixed(0)}%
                      {selected.estimated_depth_cm != null &&
                        ` · ${selected.estimated_depth_cm}×${selected.estimated_width_cm} cm`}
                    </Text>
                  </>
                )}
                <Text style={styles.coords}>
                  {selected.latitude?.toFixed(6)}, {selected.longitude?.toFixed(6)}
                </Text>
                {selected.class_name !== "photo" && (
                  <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                    <Text style={styles.confirmText}>✓ {t.confirmBtn}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={deleting}>
                  <Text style={styles.deleteText}>{deleting ? "..." : t.delete}</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function LegendDot({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  legendWrap: { position: "absolute", bottom: 0, left: 0, right: 0 },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: "rgba(8,13,24,0.92)",
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  count: { marginLeft: "auto", color: colors.primary, fontWeight: "800", fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: "72%",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  close: { alignSelf: "flex-end" },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: spacing.sm },
  meta: { color: colors.textMuted, fontSize: 13, fontWeight: "600", marginBottom: spacing.md },
  photo: { width: "100%", height: 210, borderRadius: radius.md, marginBottom: spacing.md },
  conf: { color: colors.accent, fontWeight: "800", fontSize: 16 },
  coords: { color: colors.textDim, fontSize: 12, marginTop: 8 },
  confirmBtn: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(74,222,128,0.12)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.35)",
    alignItems: "center",
  },
  confirmText: { color: colors.success, fontWeight: "800" },
  deleteBtn: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(251,113,133,0.12)",
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.35)",
    alignItems: "center",
  },
  deleteText: { color: colors.danger, fontWeight: "800" },
});
