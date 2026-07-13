import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";

export default function ScreenHeader({
  title,
  subtitle,
  onAction,
  actionIcon = "refresh",
  onBell,
  unreadCount = 0,
}) {
  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={["rgba(6,182,212,0.12)", "transparent"]}
        style={styles.glow}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={styles.row}>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.actionsRow}>
          {onBell ? (
            <TouchableOpacity style={styles.action} onPress={onBell} activeOpacity={0.85}>
              <Ionicons name="notifications-outline" size={20} color={colors.primary} />
              {unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ) : null}
          {onAction ? (
            <TouchableOpacity style={styles.action} onPress={onAction} activeOpacity={0.85}>
              <Ionicons name={actionIcon} size={20} color={colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: Platform.OS === "ios" ? 54 : 38,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    backgroundColor: colors.bgSoft,
    overflow: "hidden",
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  textBlock: { flex: 1 },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: 0.3,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  action: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(6,182,212,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.bgSoft,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
});
