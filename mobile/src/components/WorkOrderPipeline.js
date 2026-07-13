import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../theme";

export const STATUS_META = {
  open: { color: "#6f7f9e", icon: "ellipse-outline" },
  assigned: { color: "#2ee6ff", icon: "person-add-outline" },
  accepted: { color: "#9d8cff", icon: "checkmark-circle-outline" },
  in_progress: { color: "#ffd27a", icon: "construct-outline" },
  completed: { color: "#3dffa8", icon: "camera-outline" },
  verified: { color: "#3dffa8", icon: "shield-checkmark-outline" },
  cancelled: { color: "#ff6b8a", icon: "close-circle-outline" },
  declined: { color: "#ff6b8a", icon: "close-circle-outline" },
};

export const PRIORITY_COLOR = {
  low: "#6f7f9e",
  medium: "#2ee6ff",
  high: "#ffd27a",
  critical: "#ff6b8a",
};

const PIPELINE = ["assigned", "accepted", "in_progress", "completed", "verified"];

export function statusColor(status) {
  return (STATUS_META[status] || STATUS_META.open).color;
}

export default function WorkOrderPipeline({ status }) {
  const currentIndex = PIPELINE.indexOf(status);
  const isTerminalBad = status === "cancelled" || status === "declined";

  return (
    <View style={styles.wrap}>
      {PIPELINE.map((stage, idx) => {
        const meta = STATUS_META[stage];
        const done = !isTerminalBad && currentIndex >= idx;
        const active = currentIndex === idx;
        return (
          <View key={stage} style={styles.step}>
            <View
              style={[
                styles.dot,
                { borderColor: done ? meta.color : colors.cardBorder },
                done && { backgroundColor: `${meta.color}22` },
                active && styles.dotActive,
              ]}
            >
              <Ionicons
                name={meta.icon}
                size={14}
                color={done ? meta.color : colors.textDim}
              />
            </View>
            {idx < PIPELINE.length - 1 ? (
              <View
                style={[
                  styles.bar,
                  { backgroundColor: currentIndex > idx ? meta.color : colors.cardBorder },
                ]}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  step: { flexDirection: "row", alignItems: "center", flex: 1 },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  dotActive: {
    shadowColor: "#2ee6ff",
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  bar: { flex: 1, height: 2, marginHorizontal: 2, borderRadius: 2 },
});
