import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocale } from "../LocaleContext";
import { colors, radius } from "../theme";

const TABS = [
  { id: "camera", labelKey: "camera", icon: "camera" },
  { id: "map", labelKey: "map", icon: "map" },
  { id: "tasks", labelKey: "tasks", icon: "clipboard" },
  { id: "activity", labelKey: "activity", icon: "pulse" },
  { id: "profile", labelKey: "profile", icon: "person" },
];

export default function TabBar({ active, onChange }) {
  const { locale, t } = useLocale();

  return (
    <View style={styles.outer}>
      <LinearGradient
        colors={["rgba(3,5,8,0)", "rgba(3,5,8,0.95)", "#030508"]}
        style={styles.fade}
        pointerEvents="none"
      />
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tab}
              onPress={() => onChange(tab.id)}
              activeOpacity={0.88}
            >
              {isActive ? (
                <LinearGradient
                  colors={["rgba(34,211,238,0.22)", "rgba(167,139,250,0.12)"]}
                  style={styles.activeBg}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name={tab.icon} size={22} color={colors.primary} />
                  <Text style={[styles.label, styles.labelActive]}>{t[tab.labelKey]}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.inactiveInner}>
                  <Ionicons name={`${tab.icon}-outline`} size={22} color={colors.textDim} />
                  <Text style={styles.label}>{t[tab.labelKey]}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text
        style={[
          styles.credit,
          { writingDirection: locale === "ar" ? "rtl" : "ltr" },
        ]}
      >
        {t.creator}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: "relative",
    backgroundColor: "#030508",
    borderTopWidth: 1,
    borderTopColor: "rgba(34,211,238,0.15)",
  },
  fade: {
    position: "absolute",
    top: -28,
    left: 0,
    right: 0,
    height: 28,
  },
  bar: {
    flexDirection: "row",
    backgroundColor: "rgba(8,13,24,0.98)",
    paddingBottom: 6,
    paddingTop: 10,
    paddingHorizontal: 8,
    gap: 4,
  },
  tab: { flex: 1 },
  activeBg: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.35)",
  },
  inactiveInner: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  label: { fontSize: 11, color: colors.textDim, fontWeight: "600" },
  labelActive: { color: colors.primary, fontWeight: "800" },
  credit: {
    width: "100%",
    alignSelf: "center",
    color: "#ffc2d6",
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: Platform.OS === "ios" ? 18 : 10,
  },
});
