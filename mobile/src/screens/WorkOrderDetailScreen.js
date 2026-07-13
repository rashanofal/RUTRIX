import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import {
  acceptWorkOrder,
  completeWorkOrder,
  declineWorkOrder,
  fetchWorkOrder,
  imageUrl,
  startWorkOrder,
} from "../api";
import { useLocale } from "../LocaleContext";
import WorkOrderPipeline, { STATUS_META } from "../components/WorkOrderPipeline";
import { colors, radius, spacing } from "../theme";

export default function WorkOrderDetailScreen({ apiUrl, workOrderId, visible, onClose, onChanged }) {
  const { t } = useLocale();
  const [wo, setWo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [proofUri, setProofUri] = useState(null);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    if (!workOrderId) return;
    setLoading(true);
    try {
      setWo(await fetchWorkOrder(apiUrl, workOrderId));
    } catch {
      setWo(null);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, workOrderId]);

  useEffect(() => {
    if (visible) {
      setCompleting(false);
      setProofUri(null);
      setNotes("");
      load();
    }
  }, [visible, load]);

  const afterAction = (updated) => {
    setWo(updated);
    onChanged?.();
  };

  const runAction = async (fn) => {
    setBusy(true);
    try {
      const updated = await fn();
      afterAction(updated);
    } catch (e) {
      Alert.alert(t.error, e.message || t.actionFail);
    } finally {
      setBusy(false);
    }
  };

  const onAccept = () => runAction(() => acceptWorkOrder(apiUrl, wo.id));
  const onStart = () => runAction(() => startWorkOrder(apiUrl, wo.id));

  const onDecline = () => {
    Alert.prompt?.(
      t.decline,
      t.declinePrompt,
      (reason) => runAction(() => declineWorkOrder(apiUrl, wo.id, reason)),
      "plain-text"
    );
    if (Platform.OS !== "ios") {
      runAction(() => declineWorkOrder(apiUrl, wo.id, null));
    }
  };

  const captureProof = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    let pick;
    if (perm.granted) {
      pick = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    } else {
      pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    }
    if (!pick.canceled && pick.assets?.[0]) setProofUri(pick.assets[0].uri);
  };

  const submitComplete = async () => {
    if (!proofUri) {
      Alert.alert(t.error, t.proofRequired);
      return;
    }
    setBusy(true);
    try {
      const updated = await completeWorkOrder(apiUrl, wo.id, { notes, proofUri });
      setCompleting(false);
      afterAction(updated);
    } catch (e) {
      Alert.alert(t.error, e.message || t.actionFail);
    } finally {
      setBusy(false);
    }
  };

  const openMaps = () => {
    const lat = wo?.detection?.latitude;
    const lon = wo?.detection?.longitude;
    if (lat == null || lon == null) return;
    const url = Platform.select({
      ios: `maps://?daddr=${lat},${lon}`,
      android: `google.navigation:q=${lat},${lon}`,
    });
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`)
    );
  };

  const meta = wo ? STATUS_META[wo.status] || STATUS_META.open : STATUS_META.open;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="chevron-down" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t.workOrderDetail}</Text>
          <View style={{ width: 40 }} />
        </View>

        {loading || !wo ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.titleRow}>
              <Text style={styles.woTitle}>#{wo.id} · {wo.title}</Text>
              <View style={[styles.statusPill, { backgroundColor: `${meta.color}1e`, borderColor: `${meta.color}55` }]}>
                <Ionicons name={meta.icon} size={13} color={meta.color} />
                <Text style={[styles.statusText, { color: meta.color }]}>
                  {t[`status_${wo.status}`] || wo.status}
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <WorkOrderPipeline status={wo.status} />
            </View>

            {wo.description ? <Text style={styles.desc}>{wo.description}</Text> : null}

            {wo.detection?.latitude != null ? (
              <View style={styles.card}>
                <View style={styles.locHead}>
                  <Ionicons name="location" size={16} color={colors.primary} />
                  <Text style={styles.cardLabel}>{t.location}</Text>
                </View>
                <Text style={styles.coords}>
                  {wo.detection.latitude.toFixed(5)}, {wo.detection.longitude.toFixed(5)}
                </Text>
                <TouchableOpacity style={styles.navBtn} onPress={openMaps} activeOpacity={0.85}>
                  <Ionicons name="navigate" size={16} color={colors.bg} />
                  <Text style={styles.navText}>{t.navigate}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {wo.proof_image_url ? (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>{t.proofPhoto}</Text>
                <Image
                  source={{ uri: imageUrl(apiUrl, wo.proof_image_url) }}
                  style={styles.proofImg}
                  resizeMode="cover"
                />
              </View>
            ) : null}

            {wo.events?.length ? (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>{t.timeline}</Text>
                {wo.events.map((ev) => (
                  <View key={ev.id} style={styles.timelineRow}>
                    <View style={styles.timelineDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timelineType}>
                        {t[`status_${ev.to_status}`] || ev.event_type}
                      </Text>
                      <Text style={styles.timelineMeta}>
                        {ev.actor_name ? `${ev.actor_name} · ` : ""}
                        {new Date(ev.created_at).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {completing ? (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>{t.completeWork}</Text>
                <TouchableOpacity style={styles.proofPick} onPress={captureProof} activeOpacity={0.85}>
                  {proofUri ? (
                    <Image source={{ uri: proofUri }} style={styles.proofPreview} resizeMode="cover" />
                  ) : (
                    <View style={styles.proofPlaceholder}>
                      <Ionicons name="camera" size={28} color={colors.primary} />
                      <Text style={styles.proofHint}>{t.addProof}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {proofUri ? (
                  <TouchableOpacity onPress={captureProof}>
                    <Text style={styles.changeProof}>{t.changeProof}</Text>
                  </TouchableOpacity>
                ) : null}
                <TextInput
                  style={styles.notesInput}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={t.notesPlaceholder}
                  placeholderTextColor={colors.textDim}
                  multiline
                />
              </View>
            ) : null}

            <View style={styles.actions}>{renderActions()}</View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );

  function renderActions() {
    if (!wo) return null;
    if (busy) return <ActivityIndicator color={colors.primary} />;

    if (completing) {
      return (
        <>
          <PrimaryBtn label={t.submitComplete} icon="checkmark-done" onPress={submitComplete} />
          <GhostBtn label={t.cancel} onPress={() => setCompleting(false)} />
        </>
      );
    }

    switch (wo.status) {
      case "assigned":
        return (
          <>
            <PrimaryBtn label={t.accept} icon="checkmark-circle" onPress={onAccept} />
            <PrimaryBtn label={t.startWork} icon="construct" onPress={onStart} tone="amber" />
            <GhostBtn label={t.decline} onPress={onDecline} tone="danger" />
          </>
        );
      case "accepted":
        return <PrimaryBtn label={t.startWork} icon="construct" onPress={onStart} tone="amber" />;
      case "in_progress":
        return (
          <PrimaryBtn
            label={t.completeWork}
            icon="camera"
            tone="green"
            onPress={() => setCompleting(true)}
          />
        );
      default:
        return null;
    }
  }
}

function PrimaryBtn({ label, icon, onPress, tone }) {
  const grad =
    tone === "green"
      ? ["#3dffa8", "#22c1a5"]
      : tone === "amber"
      ? ["#ffd27a", "#ff9d5c"]
      : colors.gradient;
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient colors={grad} style={styles.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Ionicons name={icon} size={18} color={colors.bg} />
        <Text style={styles.btnText}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function GhostBtn({ label, onPress, tone }) {
  const c = tone === "danger" ? colors.danger : colors.textMuted;
  return (
    <TouchableOpacity style={[styles.ghostBtn, { borderColor: `${c}55` }]} onPress={onPress}>
      <Text style={[styles.ghostText, { color: c }]}>{label}</Text>
    </TouchableOpacity>
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
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  content: { padding: spacing.md, paddingBottom: 60, gap: spacing.md },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  woTitle: { color: colors.text, fontSize: 18, fontWeight: "900", flex: 1 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusText: { fontSize: 12, fontWeight: "800" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 10,
  },
  cardLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },
  desc: { color: colors.textMuted, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  locHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  coords: { color: colors.text, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  navText: { color: colors.bg, fontWeight: "800", fontSize: 14 },
  proofImg: { width: "100%", height: 200, borderRadius: radius.md },
  timelineRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 4 },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  timelineType: { color: colors.text, fontWeight: "700", fontSize: 13 },
  timelineMeta: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  proofPick: { borderRadius: radius.md, overflow: "hidden" },
  proofPreview: { width: "100%", height: 200, borderRadius: radius.md },
  proofPlaceholder: {
    height: 140,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surface,
  },
  proofHint: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  changeProof: { color: colors.primary, textAlign: "center", fontWeight: "700", fontSize: 12 },
  notesInput: {
    backgroundColor: colors.surface,
    color: colors.text,
    padding: 12,
    borderRadius: radius.md,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  actions: { gap: 10, marginTop: 4 },
  btn: { borderRadius: radius.md, overflow: "hidden" },
  btnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  btnText: { color: colors.bg, fontWeight: "900", fontSize: 15 },
  ghostBtn: {
    paddingVertical: 13,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  ghostText: { fontWeight: "800", fontSize: 14 },
});
