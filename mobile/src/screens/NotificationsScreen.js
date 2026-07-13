import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api";
import { useLocale } from "../LocaleContext";
import { STATUS_META } from "../components/WorkOrderPipeline";
import { colors, radius, spacing } from "../theme";

const TYPE_ICON = {
  work_order_assigned: "person-add",
  work_order_accepted: "checkmark-circle",
  work_order_declined: "close-circle",
  work_order_started: "construct",
  work_order_completed: "camera",
  work_order_verified: "shield-checkmark",
  work_order_cancelled: "ban",
  critical_detection: "warning",
};

export default function NotificationsScreen({ apiUrl, visible, onClose, onOpenWorkOrder, onChanged }) {
  const { t } = useLocale();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchNotifications(apiUrl));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const handleTap = async (note) => {
    if (!note.is_read) {
      try {
        await markNotificationRead(apiUrl, note.id);
        setItems((prev) => prev.map((n) => (n.id === note.id ? { ...n, is_read: true } : n)));
        onChanged?.();
      } catch {
        /* ignore */
      }
    }
    if (note.work_order_id) {
      onClose?.();
      onOpenWorkOrder?.(note.work_order_id);
    }
  };

  const handleReadAll = async () => {
    try {
      await markAllNotificationsRead(apiUrl);
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      onChanged?.();
    } catch {
      /* ignore */
    }
  };

  const renderItem = ({ item }) => {
    const color = STATUS_META[item.type?.replace("work_order_", "")]?.color || colors.primary;
    const icon = TYPE_ICON[item.type] || "notifications";
    return (
      <TouchableOpacity
        style={[styles.card, !item.is_read && styles.cardUnread]}
        activeOpacity={0.85}
        onPress={() => handleTap(item)}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${color}1e` }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          {item.body ? <Text style={styles.body} numberOfLines={2}>{item.body}</Text> : null}
          <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
        </View>
        {!item.is_read ? <View style={styles.unreadDot} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="chevron-down" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t.notifications}</Text>
          <TouchableOpacity onPress={handleReadAll} style={styles.iconBtn}>
            <Ionicons name="checkmark-done" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => String(i.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="notifications-off-outline" size={44} color={colors.textDim} />
                <Text style={styles.empty}>{t.noNotifications}</Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 54 : 34,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.bgSoft,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 40 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.sm,
  },
  cardUnread: { borderColor: "rgba(46,230,255,0.4)", backgroundColor: "rgba(46,230,255,0.06)" },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.text, fontWeight: "800", fontSize: 14 },
  body: { color: colors.textMuted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  time: { color: colors.textDim, fontSize: 11, marginTop: 4 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  emptyWrap: { alignItems: "center", marginTop: 60, gap: 12 },
  empty: { textAlign: "center", color: colors.textDim, fontSize: 14 },
});
