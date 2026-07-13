import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { registerPushToken } from "../api";

// expo-notifications is optional at runtime (e.g. Expo Go SDK 53+ limits push).
// Load defensively so the app never crashes if the module is unavailable.
let Notifications = null;
try {
  Notifications = require("expo-notifications");
} catch {
  Notifications = null;
}

if (Notifications?.setNotificationHandler) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Registers the device for Expo push, sends the token to the backend, and
 * wires notification tap handling to a deep-link callback (work order id).
 */
export function usePushNotifications({ apiUrl, enabled, onOpenWorkOrder }) {
  const receivedSub = useRef(null);
  const responseSub = useRef(null);

  useEffect(() => {
    if (!enabled || !Notifications) return;
    let cancelled = false;

    (async () => {
      try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        let status = existing;
        if (existing !== "granted") {
          const req = await Notifications.requestPermissionsAsync();
          status = req.status;
        }
        if (status !== "granted") return;

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "RUTRIX",
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#2ee6ff",
          });
        }

        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ||
          Constants?.easConfig?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        );
        if (!cancelled && tokenData?.data) {
          await registerPushToken(apiUrl, tokenData.data, Platform.OS).catch(() => {});
        }
      } catch {
        /* push not available — in-app notifications still work */
      }
    })();

    responseSub.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      const woId = data?.work_order_id;
      if (woId) onOpenWorkOrder?.(woId);
    });

    return () => {
      cancelled = true;
      receivedSub.current?.remove?.();
      responseSub.current?.remove?.();
    };
  }, [apiUrl, enabled, onOpenWorkOrder]);
}
