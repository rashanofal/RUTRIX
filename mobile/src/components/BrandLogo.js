import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocale } from "../LocaleContext";
import { colors, radius, spacing, shadows } from "../theme";

export default function BrandLogo({ size = "md", showScientific = true }) {
  const { t } = useLocale();
  const isLg = size === "lg";

  return (
    <View style={styles.wrap}>
      <View style={[styles.ringOuter, isLg && styles.ringOuterLg]}>
        <LinearGradient
          colors={colors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.ring, isLg && styles.ringLg]}
        >
          <View style={[styles.inner, isLg && styles.innerLg]}>
            <Text style={[styles.letter, isLg && styles.letterLg]}>R</Text>
          </View>
        </LinearGradient>
      </View>
      <Text style={[styles.name, isLg && styles.nameLg]}>{t.brand}</Text>
      {showScientific ? (
        <Text style={[styles.scientific, isLg && styles.scientificLg]}>{t.scientific}</Text>
      ) : null}
      {isLg && t.tagline ? (
        <Text style={styles.tagline}>{t.tagline}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  ringOuter: {
    marginBottom: spacing.sm,
    ...shadows.glow,
  },
  ringOuterLg: { marginBottom: spacing.md },
  ring: {
    width: 68,
    height: 68,
    borderRadius: 20,
    padding: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  ringLg: { width: 92, height: 92, borderRadius: 26, padding: 3 },
  inner: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  innerLg: { borderRadius: 23 },
  letter: { fontSize: 32, fontWeight: "900", color: colors.primary },
  letterLg: { fontSize: 42 },
  name: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: 2,
  },
  nameLg: { fontSize: 36, letterSpacing: 3 },
  scientific: {
    color: colors.violet,
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: spacing.lg,
    lineHeight: 18,
    fontWeight: "600",
  },
  scientificLg: { fontSize: 13, lineHeight: 20 },
  tagline: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    fontWeight: "600",
  },
});
