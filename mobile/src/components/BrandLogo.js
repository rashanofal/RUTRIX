import { View, Text, Image, StyleSheet } from "react-native";
import { useLocale } from "../LocaleContext";
import { colors, spacing } from "../theme";

const logoFull = require("../../assets/logo.png");
const logoMark = require("../../assets/logo-mark.png");

const MARK_SIZES = { sm: 34, md: 48, lg: 64, xl: 96 };

/**
 * Brand lockup.
 * - variant="full": stylized R + RUTRIX wordmark (default).
 * - variant="mark": square symbol only — crisp in headers, avatars, tight spaces.
 */
export default function BrandLogo({ size = "md", showScientific = true, variant = "full" }) {
  const { t } = useLocale();

  if (variant === "mark") {
    const dim = MARK_SIZES[size] || MARK_SIZES.md;
    return (
      <Image
        source={logoMark}
        style={{ width: dim, height: dim }}
        resizeMode="contain"
      />
    );
  }

  const isLg = size === "lg";
  const isSm = size === "sm";

  return (
    <View style={styles.wrap}>
      <Image
        source={logoFull}
        style={[
          isSm ? styles.logoSm : styles.logo,
          isLg && styles.logoLg,
        ]}
        resizeMode="contain"
      />
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
  wrap: { alignItems: "center" },
  logoSm: {
    width: 140,
    height: 38,
    marginBottom: spacing.sm,
  },
  logo: {
    width: 260,
    height: 70,
    marginBottom: spacing.sm,
  },
  logoLg: {
    width: 320,
    height: 86,
    marginBottom: spacing.md,
  },
  scientific: {
    color: colors.violet,
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
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
