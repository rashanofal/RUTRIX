import { View, Text, StyleSheet } from "react-native";
import { colors, radius } from "../theme";

export default function StatusChip({ label, active, color }) {
  const dotColor = color || (active ? colors.success : colors.danger);
  return (
    <View style={[styles.chip, active ? styles.on : styles.off]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]}>
        {active ? <View style={styles.dotPulse} /> : null}
      </View>
      <Text style={[styles.text, active && styles.textOn]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  on: {
    backgroundColor: "rgba(74,222,128,0.1)",
    borderColor: "rgba(74,222,128,0.35)",
  },
  off: {
    backgroundColor: "rgba(251,113,133,0.08)",
    borderColor: "rgba(251,113,133,0.3)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  dotPulse: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(74,222,128,0.25)",
  },
  text: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  textOn: { color: colors.success },
});
