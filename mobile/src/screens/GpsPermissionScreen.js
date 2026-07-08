import { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocale } from "../LocaleContext";
import BrandLogo from "../components/BrandLogo";
import { colors, radius, spacing } from "../theme";

export default function GpsPermissionScreen({
  status,
  onRequest,
  onContinue,
}) {
  const { t, toggleLocale } = useLocale();
  const { phase, granted, label } = status;

  useEffect(() => {
    onRequest?.();
  }, []);

  const showSpinner = phase === "requesting" || phase === "starting";

  return (
    <LinearGradient colors={colors.gradientDark} style={styles.root}>
      <TouchableOpacity style={styles.langBtn} onPress={toggleLocale}>
        <Text style={styles.langText}>{t.lang}</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <BrandLogo size="lg" />

        <View style={styles.iconRing}>
          {showSpinner ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <Ionicons
              name={granted ? "location" : "location-outline"}
              size={52}
              color={granted ? colors.success : colors.primary}
            />
          )}
        </View>

        <Text style={styles.title}>{t.gpsTitle}</Text>
        <Text style={styles.subtitle}>{t.gpsSubtitle}</Text>

        <View style={styles.steps}>
          {t.gpsSteps.map((step, i) => (
            <View key={step} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        {label ? <Text style={styles.status}>{label}</Text> : null}

        {!granted && phase === "denied" ? (
          <>
            <TouchableOpacity style={styles.primaryBtn} onPress={onRequest}>
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                style={styles.btnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="navigate" size={20} color={colors.bg} />
                <Text style={styles.primaryBtnText}>{t.gpsEnable}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => Linking.openSettings()}
            >
              <Ionicons name="settings-outline" size={18} color={colors.primary} />
              <Text style={styles.settingsText}>{t.gpsSettings}</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {granted ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={onContinue}>
            <LinearGradient
              colors={[colors.success, "#059669"]}
              style={styles.btnGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.primaryBtnText}>{t.gpsContinue}</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.bg} />
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.skipBtn} onPress={onContinue}>
            <Text style={styles.skipText}>{t.gpsSkip}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.footer}>{t.gpsFooter}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  langBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 40,
    right: spacing.lg,
    zIndex: 2,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: "rgba(16,26,46,0.8)",
  },
  langText: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === "ios" ? 80 : 64,
    paddingBottom: spacing.xl,
  },
  iconRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: "rgba(6,182,212,0.35)",
    backgroundColor: "rgba(6,182,212,0.08)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  steps: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.md,
    gap: 10,
  },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(6,182,212,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  stepNumText: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  stepText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  status: {
    color: colors.warning,
    textAlign: "center",
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  primaryBtn: { borderRadius: radius.md, overflow: "hidden", marginTop: spacing.sm },
  btnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  primaryBtnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  settingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: spacing.md,
    paddingVertical: 12,
  },
  settingsText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  skipBtn: { marginTop: spacing.lg, alignItems: "center", paddingVertical: 10 },
  skipText: { color: colors.textDim, fontSize: 13 },
  footer: {
    color: colors.textDim,
    textAlign: "center",
    fontSize: 11,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    paddingHorizontal: spacing.lg,
  },
});
