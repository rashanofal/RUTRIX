import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocale } from "../LocaleContext";
import BrandLogo from "../components/BrandLogo";
import { login, register } from "../auth";
import { checkHealth } from "../api";
import { colors, radius, spacing } from "../theme";

export default function LoginScreen({ apiUrl, onLoggedIn }) {
  const { t, toggleLocale } = useLocale();
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [serverOk, setServerOk] = useState(null);
  const [error, setError] = useState("");
  const [serverUrl, setServerUrl] = useState(apiUrl);
  const [form, setForm] = useState({
    email: "demo@pothole.app",
    password: "demo1234",
    full_name: "",
    organization_name: "",
  });

  const testServer = async () => {
    setTesting(true);
    setServerOk(null);
    const ok = await checkHealth(serverUrl);
    setServerOk(ok);
    setTesting(false);
    if (!ok) setError("السيرفر لا يستجيب — تحقق من الرابط أو شغّل START.bat");
    else setError("");
  };

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const data =
        mode === "login"
          ? await login(serverUrl, form.email, form.password)
          : await register(serverUrl, form);
      onLoggedIn(data, serverUrl);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={colors.gradientDark} style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <BrandLogo size="lg" />
            <TouchableOpacity style={styles.langBtn} onPress={toggleLocale}>
              <Text style={styles.langText}>{t.lang}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{mode === "login" ? t.login : t.register}</Text>

            <View style={styles.field}>
              <Ionicons name="server-outline" size={18} color={colors.textDim} />
              <TextInput
                style={styles.input}
                value={serverUrl}
                onChangeText={(v) => {
                  setServerUrl(v);
                  setServerOk(null);
                }}
                autoCapitalize="none"
                placeholder="https://your-app.onrender.com"
                placeholderTextColor={colors.textDim}
              />
              <TouchableOpacity onPress={testServer} disabled={testing}>
                {testing ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons
                    name={serverOk === true ? "checkmark-circle" : "pulse-outline"}
                    size={22}
                    color={serverOk === true ? colors.success : colors.primary}
                  />
                )}
              </TouchableOpacity>
            </View>
            {serverOk === false && (
              <Text style={styles.warn}>تأكد: START.bat شغّال + نفس WiFi</Text>
            )}

            {mode === "register" && (
              <>
                <View style={styles.field}>
                  <Ionicons name="person-outline" size={18} color={colors.textDim} />
                  <TextInput
                    style={styles.input}
                    placeholder="الاسم الكامل"
                    placeholderTextColor={colors.textDim}
                    value={form.full_name}
                    onChangeText={(v) => setForm({ ...form, full_name: v })}
                  />
                </View>
                <View style={styles.field}>
                  <Ionicons name="business-outline" size={18} color={colors.textDim} />
                  <TextInput
                    style={styles.input}
                    placeholder="اسم المنظمة / البلدية"
                    placeholderTextColor={colors.textDim}
                    value={form.organization_name}
                    onChangeText={(v) => setForm({ ...form, organization_name: v })}
                  />
                </View>
              </>
            )}

            <View style={styles.field}>
              <Ionicons name="mail-outline" size={18} color={colors.textDim} />
              <TextInput
                style={styles.input}
                placeholder="البريد الإلكتروني"
                placeholderTextColor={colors.textDim}
                value={form.email}
                onChangeText={(v) => setForm({ ...form, email: v })}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.field}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textDim} />
              <TextInput
                style={styles.input}
                placeholder="كلمة المرور"
                placeholderTextColor={colors.textDim}
                value={form.password}
                onChangeText={(v) => setForm({ ...form, password: v })}
                secureTextEntry
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity style={styles.btn} onPress={submit} disabled={loading}>
              <LinearGradient colors={colors.gradient} style={styles.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {loading ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.btnText}>
                    {mode === "login" ? t.submitLogin : t.submitRegister}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setMode(mode === "login" ? "register" : "login")}>
              <Text style={styles.toggle}>
                {mode === "login" ? t.toggleRegister : t.toggleLogin}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.demo}>{t.demo}</Text>
          <Text style={styles.footerCredit}>{t.creator}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.lg, paddingTop: 56, paddingBottom: 32 },
  hero: { alignItems: "center", marginBottom: spacing.lg, gap: spacing.sm },
  langBtn: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  langText: { color: colors.primary, fontWeight: "800" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.2)",
    shadowColor: "#22d3ee",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: spacing.md,
    textAlign: "right",
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  input: {
    flex: 1,
    color: colors.text,
    paddingVertical: 14,
    fontSize: 15,
    textAlign: "right",
  },
  error: { color: colors.danger, fontSize: 13, marginBottom: 8, textAlign: "right" },
  btn: { borderRadius: radius.md, overflow: "hidden", marginTop: 4 },
  btnGrad: { paddingVertical: 15, alignItems: "center" },
  btnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  toggle: { color: colors.primary, textAlign: "center", marginTop: spacing.md, fontSize: 14 },
  demo: { color: colors.textDim, textAlign: "center", marginTop: spacing.lg, fontSize: 12 },
  footerCredit: {
    color: "#ffc2d6",
    textAlign: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  warn: { color: colors.warning, fontSize: 12, marginBottom: 8, textAlign: "right" },
});
