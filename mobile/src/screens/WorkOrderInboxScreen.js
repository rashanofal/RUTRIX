import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fetchMyWorkOrders } from "../api";
import { useLocale } from "../LocaleContext";
import ScreenHeader from "../components/ScreenHeader";
import { PRIORITY_COLOR, STATUS_META, statusColor } from "../components/WorkOrderPipeline";
import { colors, radius, spacing } from "../theme";

const FILTERS = {
  all: null,
  active: ["assigned", "accepted", "in_progress"],
  done: ["completed", "verified"],
};

export default function WorkOrderInboxScreen({ apiUrl, refreshKey, onOpenDetail, onBell, unreadCount }) {
  const { t } = useLocale();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("active");

  const load = useCallback(async () => {
    try {
      setOrders(await fetchMyWorkOrders(apiUrl));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const filtered = useMemo(() => {
    const allowed = FILTERS[filter];
    if (!allowed) return orders;
    return orders.filter((o) => allowed.includes(o.status));
  }, [orders, filter]);

  const renderItem = ({ item }) => {
    const meta = STATUS_META[item.status] || STATUS_META.open;
    const prioColor = PRIORITY_COLOR[item.priority] || colors.textDim;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => onOpenDetail?.(item.id)}
      >
        <View style={[styles.prioStripe, { backgroundColor: prioColor }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text style={styles.title} numberOfLines={1}>
              #{item.id} · {item.title}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: `${meta.color}1e`, borderColor: `${meta.color}55` }]}>
              <Ionicons name={meta.icon} size={12} color={meta.color} />
              <Text style={[styles.statusText, { color: meta.color }]}>
                {t[`status_${item.status}`] || item.status}
              </Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.prio, { color: prioColor }]}>
              {t.priorityLabel}: {t[`prio_${item.priority}`] || item.priority}
            </Text>
            {item.detection?.latitude != null ? (
              <View style={styles.locChip}>
                <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                <Text style={styles.locText}>
                  {item.detection.latitude.toFixed(3)}, {item.detection.longitude.toFixed(3)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t.tasksTitle}
        subtitle={t.tasksSubtitle}
        onAction={load}
        onBell={onBell}
        unreadCount={unreadCount}
      />
      <View style={styles.tabs}>
        {Object.keys(FILTERS).map((id) => (
          <TouchableOpacity
            key={id}
            style={[styles.tabBtn, filter === id && styles.tabActive]}
            onPress={() => setFilter(id)}
          >
            <Text style={[styles.tabText, filter === id && styles.tabTextActive]}>
              {t[`filter${id.charAt(0).toUpperCase()}${id.slice(1)}`]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="clipboard-outline" size={44} color={colors.textDim} />
              <Text style={styles.empty}>{t.noTasks}</Text>
            </View>
          }
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
    paddingVertical: spacing.sm,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tabActive: { borderColor: colors.primary, backgroundColor: "rgba(46,230,255,0.12)" },
  tabText: { fontSize: 12, color: colors.textDim, fontWeight: "700" },
  tabTextActive: { color: colors.primary, fontWeight: "800" },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 140 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  prioStripe: { width: 4, alignSelf: "stretch" },
  cardBody: { flex: 1, padding: spacing.md, gap: 8 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { color: colors.text, fontWeight: "800", fontSize: 14, flex: 1 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  prio: { fontSize: 12, fontWeight: "700" },
  locChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  locText: { color: colors.textMuted, fontSize: 11 },
  emptyWrap: { alignItems: "center", marginTop: 60, gap: 12 },
  empty: { textAlign: "center", color: colors.textDim, fontSize: 14 },
});
