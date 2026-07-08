import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_KEY = "pothole_auth";

export async function getStoredAuth() {
  try {
    const raw = await AsyncStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveAuth(data) {
  await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(data));
}

export async function clearAuth() {
  await AsyncStorage.removeItem(AUTH_KEY);
}

export async function getToken() {
  const auth = await getStoredAuth();
  return auth?.access_token || null;
}

export async function login(apiBase, email, password) {
  const base = apiBase.replace(/\/$/, "");
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "فشل تسجيل الدخول");
  }
  const data = await res.json();
  await saveAuth(data);
  return data;
}

export async function register(apiBase, payload) {
  const base = apiBase.replace(/\/$/, "");
  const res = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "فشل التسجيل");
  }
  const data = await res.json();
  await saveAuth(data);
  return data;
}
