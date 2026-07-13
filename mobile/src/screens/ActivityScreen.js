import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { fetchPriorities, fetchRecent, fetchWorkOrders, updateWorkOrder } from "../api";
import { useLocale } from "../LocaleContext";
import ScreenHeader from "../components/ScreenHeader";
import { colors, radius, spacing } from "../theme";

const TABS = ["recent", "priorities", "maintenance"];
const STATUS_NEXT = {
  open: "assigned",
  assigned: "in_progress",
  in_progress: "completed",
  completed: "verified",
};

export default function ActivityScreen({ apiUrl, refreshKey, onBell, unreadCount }) {
  const { t } = useLocale();
  const [tab, setTab] = useState("recent");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "recent") setItems(await fetchRecent(apiUrl, 50));
      else if (tab === "priorities") setItems(await fetchPriorities(apiUrl, 30));
      else setItems(await fetchWorkOrders(apiUrl));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, tab]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const advanceOrder = async (wo) => {
    const next = STATUS_NEXT[wo.status];
    if (!next) return;
    try {
      await updateWorkOrder(apiUrl, wo.id, { status: next });
      load();
    } catch {
      Alert.alert(t.error, t.workOrderFail);
    }
  };

  const renderRecent = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.title}>
          {item.class_name === "photo" ? t.photo : t.pothole} #{item.id}
        </Text>
        {item.class_name !== "photo" && (
          <Text style={styles.meta}>
            RUT {item.rut_score ?? 0} · {(item.confidence * 100).toFixed(0)}%
          </Text>
        )}
      </View>
    </View>
  );

  const renderPriority = ({ item }) => (
    <View style={[styles.card, styles.priorityCard]}>
      <Text style={styles.title}>
        #{item.id} · RUT {item.rut_score}
      </Text>
      <Text style={styles.meta}>
        {item.anomaly_type} · {item.severity}
      </Text>
      {item.predicted_days_to_critical != null && (
        <Text style={styles.warn}>
          ⚠ {item.predicted_days_to_critical} {t.days}
        </Text>
      )}
    </View>
  );

  const renderWorkOrder = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.title}>#{item.id} · {item.title}</Text>
      <Text style={styles.meta}>{item.status} · {item.priority}</Text>
      {item.status !== "verified" && item.status !== "cancelled" && (
        <TouchableOpacity style={styles.advanceBtn} onPress={() => advanceOrder(item)}>
          <Text style={styles.advanceText}>{t.advanceStatus}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderItem =
    tab === "priorities" ? renderPriority : tab === "maintenance" ? renderWorkOrder : renderRecent;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t.activityTitle}
        onAction={load}
        onBell={onBell}
        unreadCount={unreadCount}
      />
      <View style={styles.tabs}>
        {TABS.map((id) => (
          <TouchableOpacity
            key={id}
            style={[styles.tabBtn, tab === id && styles.tabActive]}
            onPress={() => setTab(id)}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>{t[`tab_${id}`]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t.empty}</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabs: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: "center",
  },
  tabActive: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "rgba(34,211,238,0.1)",
  },
  tabText: { fontSize: 11, color: colors.textDim, fontWeight: "600" },
  tabTextActive: { color: colors.primary, fontWeight: "800" },
  list: { padding: spacing.md, gap: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.sm,
  },
  priorityCard: { borderLeftWidth: 3, borderLeftColor: colors.warning },
  info: { gap: 4 },
  title: { color: colors.text, fontWeight: "700", fontSize: 14 },
  meta: { color: colors.textMuted, fontSize: 12 },
  warn: { color: colors.warning, fontSize: 12, marginTop: 4 },
  empty: { textAlign: "center", color: colors.textDim, marginTop: 40 },
  advanceBtn: {
    marginTop: 8,
    backgroundColor: "rgba(34,211,238,0.15)",
    paddingVertical: 8,
    borderRadius: radius.md,
    alignItems: "center",
  },
  advanceText: { color: colors.primary, fontWeight: "800", fontSize: 12 },
});
