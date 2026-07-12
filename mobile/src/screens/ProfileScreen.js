import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { checkHealth, fetchStats, fetchLeaderboard } from "../api";
import { useLocale } from "../LocaleContext";
import StatusChip from "../components/StatusChip";
import ScreenHeader from "../components/ScreenHeader";
import { colors, radius, spacing } from "../theme";

export default function ProfileScreen({ auth, apiUrl, onApiUrlChange, onLogout }) {
  const { t } = useLocale();
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState(null);
  const [myRank, setMyRank] = useState(null);
  const [url, setUrl] = useState(apiUrl);

  useEffect(() => {
    (async () => {
      setConnected(await checkHealth(apiUrl));
      try {
        setStats(await fetchStats(apiUrl));
        const board = await fetchLeaderboard(apiUrl, 50);
        const me = board.find((b) => b.user_id === auth?.user?.id);
        setMyRank(me || null);
      } catch {
        setStats(null);
        setMyRank(null);
      }
    })();
  }, [apiUrl, auth?.user?.id]);

  const saveUrl = () => onApiUrlChange?.(url.trim());

  return (
    <View style={styles.container}>
      <ScreenHeader title={t.profile} />
      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient colors={["rgba(34,211,238,0.15)", "rgba(167,139,250,0.08)"]} style={styles.profileCard}>
          <Image source={require("../../assets/logo.png")} style={styles.brandLogo} resizeMode="contain" />
          <Text style={styles.name}>{auth?.user?.full_name}</Text>
          <Text style={styles.email}>{auth?.user?.email}</Text>
          <View style={styles.orgBadge}>
            <Ionicons name="business" size={14} color={colors.primary} />
            <Text style={styles.org}>{auth?.organization?.name}</Text>
          </View>
          <StatusChip
            label={connected ? t.connected : t.offline}
            active={connected}
          />
        </LinearGradient>

        {myRank && (
          <View style={styles.pointsCard}>
            <Text style={styles.pointsVal}>{myRank.points}</Text>
            <Text style={styles.pointsLbl}>{t.pointsLabel}</Text>
            <Text style={styles.rankTitle}>{myRank.rank_title}</Text>
          </View>
        )}

        {stats && (
          <View style={styles.statsRow}>
            <StatBox label={t.statTotal} value={stats.total_detections} />
            <StatBox label={t.statVerified} value={stats.verified_detections} />
            <StatBox label={t.statCritical} value={stats.critical_count || 0} />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.server}</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            placeholder="https://your-app.onrender.com"
            placeholderTextColor={colors.textDim}
          />
          <TouchableOpacity style={styles.saveBtn} onPress={saveUrl}>
            <LinearGradient colors={colors.gradient} style={styles.saveGrad}>
              <Text style={styles.saveText}>{t.saveServer}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.about}</Text>
          <InfoRow icon="sparkles" text={t.aboutAi} />
          <InfoRow icon="map" text={t.aboutMap} />
          <InfoRow icon="cloud" text={t.aboutSaas} />
          <Text style={styles.version}>RUTRIX v1.1.0</Text>
        </View>

        <TouchableOpacity style={styles.logout} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>{t.logout}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function StatBox({ label, value }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, text }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 120 },
  profileCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.25)",
    marginBottom: spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 22,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: "rgba(34,211,238,0.4)",
  },
  brandLogo: {
    width: 220,
    height: 60,
    marginBottom: spacing.md,
  },
  name: { color: colors.text, fontSize: 22, fontWeight: "900" },
  email: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  orgBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  org: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  pointsCard: {
    marginTop: spacing.md,
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(251,191,36,0.1)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.35)",
    width: "100%",
  },
  pointsVal: { fontSize: 32, fontWeight: "900", color: colors.accent },
  pointsLbl: { color: colors.textMuted, fontSize: 12 },
  rankTitle: { color: colors.violet, fontWeight: "800", marginTop: 4, fontSize: 13 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: spacing.md },
  statBox: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statValue: { color: colors.primary, fontSize: 24, fontWeight: "900" },
  statLabel: { color: colors.textDim, fontSize: 11, marginTop: 4, fontWeight: "600" },
  section: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: spacing.md,
    textAlign: "right",
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    padding: 14,
    borderRadius: radius.md,
    fontSize: 14,
    textAlign: "right",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  saveBtn: { borderRadius: radius.md, overflow: "hidden", marginTop: 10 },
  saveGrad: { padding: 13, alignItems: "center" },
  saveText: { color: colors.bg, fontWeight: "900" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(34,211,238,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  infoText: { color: colors.textMuted, fontSize: 14, flex: 1, textAlign: "right" },
  version: { color: colors.textDim, fontSize: 12, marginTop: 8, textAlign: "center" },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 15,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.4)",
    backgroundColor: "rgba(251,113,133,0.08)",
  },
  logoutText: { color: colors.danger, fontWeight: "800" },
});
