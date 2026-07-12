import { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { uploadDetection } from "../api";
import { useLocale } from "../LocaleContext";
import StatusChip from "../components/StatusChip";
import { colors, radius, spacing } from "../theme";

function potholeCount(detections) {
  return (detections || []).filter((d) => d.class_name && d.class_name !== "photo").length;
}

function uploadResultMessage(result, t) {
  if (result?.message) return result.message;
  const holes = potholeCount(result?.detections);
  if (holes === 0) return t.uploadedNoPotholes;
  return t.uploadedPotholes.replace("{n}", String(holes));
}

function ScanFrame() {
  return (
    <View style={styles.frameWrap} pointerEvents="none">
      <View style={styles.frameBox}>
        {["tl", "tr", "bl", "br"].map((p) => (
          <View key={p} style={[styles.corner, styles[`corner_${p}`]]} />
        ))}
        <LinearGradient
          colors={["transparent", "rgba(34,211,238,0.35)", "transparent"]}
          style={styles.scanLine}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      </View>
      <View style={styles.aiBadge}>
        <Ionicons name="sparkles" size={12} color={colors.accent} />
        <Text style={styles.aiText}>RUTRIX AI</Text>
      </View>
    </View>
  );
}

export default function CameraScreen({
  apiUrl,
  connected,
  gpsReady,
  getCoords,
  onUploaded,
  orgName,
}) {
  const { locale, t } = useLocale();
  const isRtl = locale === "ar";
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const cameraRef = useRef(null);

  const coordsPayload = () => {
    const c = getCoords?.();
    if (!c) return null;
    return { latitude: c.latitude, longitude: c.longitude };
  };

  const buildExif = () => {
    const c = getCoords?.();
    if (!c) return undefined;
    return { GPSLatitude: c.latitude, GPSLongitude: c.longitude };
  };

  const handleCapture = async () => {
    if (!cameraRef.current || loading) return;
    setLoading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.88,
        exif: true,
        additionalExif: buildExif(),
      });
      if (!photo?.uri) throw new Error(t.captureFail);
      const result = await uploadDetection(photo.uri, apiUrl, coordsPayload());
      onUploaded?.(result);
      Alert.alert(t.success, uploadResultMessage(result, t));
    } catch (e) {
      Alert.alert(t.error, e.message || t.uploadFail);
    } finally {
      setLoading(false);
    }
  };

  const handlePick = async () => {
    setLoading(true);
    try {
      const pick = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.88,
        exif: true,
      });
      if (pick.canceled) return;
      const result = await uploadDetection(pick.assets[0].uri, apiUrl, coordsPayload());
      onUploaded?.(result);
      Alert.alert(t.success, uploadResultMessage(result, t));
    } catch (e) {
      Alert.alert(t.error, e.message || t.uploadFail);
    } finally {
      setLoading(false);
    }
  };

  if (!permission?.granted) {
    return (
      <LinearGradient colors={colors.gradientDark} style={styles.perm}>
        <View style={styles.permIcon}>
          <Ionicons name="camera" size={48} color={colors.primary} />
        </View>
        <Text style={[styles.permTitle, isRtl && styles.rtlText]}>{t.permTitle}</Text>
        <Text style={[styles.permSub, isRtl && styles.rtlText]}>{t.permSub}</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <LinearGradient colors={colors.gradient} style={styles.permBtnGrad}>
            <Text style={styles.permBtnText}>{t.grant}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <LinearGradient colors={["rgba(3,5,8,0.9)", "transparent"]} style={styles.topFade} />
        <LinearGradient colors={["transparent", "rgba(3,5,8,0.95)"]} style={styles.bottomFade} />

        <View style={[styles.topBar, isRtl && styles.topBarRtl]}>
          <View>
            <Text style={[styles.title, isRtl && styles.rtlText]}>{t.detectTitle}</Text>
            {orgName ? <Text style={[styles.org, isRtl && styles.rtlText]}>{orgName}</Text> : null}
          </View>
          <View style={[styles.chips, isRtl && styles.chipsRtl]}>
            <StatusChip label={connected ? t.connected : t.offline} active={connected} />
            <StatusChip
              label={gpsReady ? t.gps : t.noGps}
              active={gpsReady}
              color={gpsReady ? colors.success : colors.warning}
            />
          </View>
        </View>

        <ScanFrame />

        <View style={[styles.hintBox, isRtl && styles.hintBoxRtl]}>
          <Ionicons name="navigate" size={16} color={colors.primary} />
          <Text style={[styles.hint, isRtl && styles.rtlText]}>{t.captureHint}</Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.sideBtn} onPress={handlePick} disabled={loading}>
            <View style={styles.sideIcon}>
              <Ionicons name="images" size={24} color={colors.text} />
            </View>
            <Text style={[styles.sideLabel, isRtl && styles.rtlText]}>{t.album}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.captureOuter, loading && styles.disabled]}
            onPress={handleCapture}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <LinearGradient colors={[colors.accent, colors.accentHot]} style={styles.captureInner} />
            )}
          </TouchableOpacity>

          <View style={styles.sideBtn}>
            <View style={[styles.sideIcon, gpsReady && styles.sideIconActive]}>
              <Ionicons
                name="locate"
                size={24}
                color={gpsReady ? colors.success : colors.textDim}
              />
            </View>
            <Text style={[styles.sideLabel, isRtl && styles.rtlText]}>{gpsReady ? t.ready : t.gps}</Text>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const CORNER = 24;
const CORNER_W = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  camera: { flex: 1 },
  topFade: { position: "absolute", top: 0, left: 0, right: 0, height: 170 },
  bottomFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 220 },
  topBar: {
    marginTop: Platform.OS === "ios" ? 54 : 36,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    zIndex: 2,
  },
  topBarRtl: { flexDirection: "row-reverse" },
  title: { fontSize: 26, fontWeight: "900", color: "#fff", letterSpacing: 0.6 },
  org: { color: "rgba(255,255,255,0.72)", fontSize: 13, marginTop: 4 },
  chips: { gap: 6, alignItems: "flex-end" },
  chipsRtl: { alignItems: "flex-start" },
  frameWrap: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  frameBox: { width: "80%", aspectRatio: 4 / 3, maxHeight: "50%", position: "relative" },
  corner: { position: "absolute", width: CORNER, height: CORNER, borderColor: colors.primary },
  corner_tl: { top: 0, left: 0, borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W, borderTopLeftRadius: 10 },
  corner_tr: { top: 0, right: 0, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W, borderTopRightRadius: 10 },
  corner_bl: { bottom: 0, left: 0, borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W, borderBottomLeftRadius: 10 },
  corner_br: { bottom: 0, right: 0, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W, borderBottomRightRadius: 10 },
  scanLine: { position: "absolute", top: "42%", left: 0, right: 0, height: 2 },
  aiBadge: {
    position: "absolute",
    top: "20%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: "rgba(3,5,8,0.7)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.35)",
  },
  aiText: { color: colors.accent, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  hintBox: {
    position: "absolute",
    bottom: 152,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(8,13,24,0.88)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.35)",
    zIndex: 2,
  },
  hint: { color: colors.primary, fontSize: 13, fontWeight: "600", maxWidth: 270 },
  hintBoxRtl: { flexDirection: "row-reverse" },
  controls: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 44 : 32,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 42,
    zIndex: 2,
  },
  sideBtn: { alignItems: "center", width: 64 },
  sideIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  sideIconActive: {
    borderColor: "rgba(74,222,128,0.5)",
    backgroundColor: "rgba(74,222,128,0.12)",
  },
  sideLabel: { color: "#fff", fontSize: 11, marginTop: 6, fontWeight: "700" },
  rtlText: { textAlign: "right", writingDirection: "rtl" },
  captureOuter: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  captureInner: { width: 66, height: 66, borderRadius: 33 },
  disabled: { opacity: 0.65 },
  perm: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  permIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(34,211,238,0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.35)",
  },
  permTitle: { color: colors.text, fontSize: 24, fontWeight: "900" },
  permSub: { color: colors.textMuted, textAlign: "center", lineHeight: 22, fontSize: 15 },
  permBtn: { borderRadius: radius.md, overflow: "hidden", marginTop: 8 },
  permBtnGrad: { paddingHorizontal: 36, paddingVertical: 15 },
  permBtnText: { color: colors.bg, fontWeight: "900", fontSize: 16 },
});
