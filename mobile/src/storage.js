import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL_KEY = "pothole_api_url";

export async function getSavedApiUrl() {
  try {
    return await AsyncStorage.getItem(API_URL_KEY);
  } catch {
    return null;
  }
}

export async function saveApiUrl(url) {
  if (url) await AsyncStorage.setItem(API_URL_KEY, url.replace(/\/$/, ""));
}

export function detectApiUrl() {
  const Constants = require("expo-constants").default;
  const fromEnv =
    process.env.EXPO_PUBLIC_API_URL ||
    Constants.expoConfig?.extra?.apiUrl;
  if (fromEnv && fromEnv.startsWith("http")) {
    return fromEnv.replace(/\/$/, "");
  }
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host && !["localhost", "127.0.0.1"].includes(host)) {
    return `http://${host}:8000`;
  }
  return "https://rashanofal8-rutrix.hf.space";
}
