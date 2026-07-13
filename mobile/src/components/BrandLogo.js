import { View, Text, Image, StyleSheet } from "react-native";
import { useLocale } from "../LocaleContext";
import { colors, spacing } from "../theme";

const logoMark = require("../../assets/logo-mark.png");

const MARK_SIZES = { sm: 34, md: 48, lg: 64, xl: 96 };

/**
 * Brand lockup: crisp mark icon + localized wordmark text.
 * Avoids bitmap wordmark glitches (black box / stray glyphs) on some devices.
 */
export default function BrandLogo({ size = "md", showScientific = true, variant = "full" }) {
  const { t } = useLocale();
  const isMarkOnly = variant === "mark";
  const isLg = size === "lg";
  const isSm = size === "sm";
  const markDim = isMarkOnly
    ? MARK_SIZES[size] || MARK_SIZES.md
    : isSm
      ? 42
      : isLg
        ? 72
        : 56;

  if (isMarkOnly) {
    return (
      <Image
        source={logoMark}
        style={{ width: markDim, height: markDim }}
        resizeMode="contain"
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <Image
        source={logoMark}
        style={{ width: markDim, height: markDim }}
        resizeMode="contain"
      />
      <Text style={[styles.brandName, isLg && styles.brandNameLg, isSm && styles.brandNameSm]}>
        {t.brand}
      </Text>
      {!isSm ? (
        <>
          {showScientific ? (
            <Text style={[styles.scientific, isLg && styles.scientificLg]}>{t.scientific}</Text>
          ) : null}
          {isLg && t.tagline ? (
            <Text style={styles.tagline}>{t.tagline}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: spacing.sm },
  brandName: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 1.2,
    textAlign: "center",
  },
  brandNameSm: { fontSize: 20, letterSpacing: 0.8 },
  brandNameLg: { fontSize: 34, letterSpacing: 1.6 },
  scientific: {
    color: colors.violet,
    fontSize: 12,
    textAlign: "center",
    marginTop: 2,
    paddingHorizontal: spacing.lg,
    lineHeight: 18,
    fontWeight: "600",
  },
  scientificLg: { fontSize: 13, lineHeight: 20 },
  tagline: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
    fontWeight: "600",
  },
});
