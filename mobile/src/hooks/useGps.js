import { useCallback, useRef, useState } from "react";
import { Linking } from "react-native";
import * as Location from "expo-location";

const LABELS = {
  ar: {
    starting: "جاري تفعيل GPS...",
    active: "GPS نشط — الموقع جاهز",
    disabled: "خدمة الموقع مغلقة في الهاتف",
    denied: "لم يُمنح إذن الموقع",
    error: "تعذّر تفعيل GPS",
  },
  en: {
    starting: "Activating GPS...",
    active: "GPS active — location ready",
    disabled: "Location services are off",
    denied: "Location permission denied",
    error: "Could not enable GPS",
  },
};

export function useGps(onCoords, locale = "ar") {
  const subRef = useRef(null);
  const coordsRef = useRef(null);
  const pathRecordingRef = useRef(false);
  const pathStartMsRef = useRef(0);
  const pathTrackRef = useRef([]);
  const [status, setStatus] = useState({
    phase: "idle",
    granted: false,
    label: "",
  });

  const L = LABELS[locale] || LABELS.ar;

  const update = useCallback((patch) => {
    setStatus((prev) => ({ ...prev, ...patch }));
  }, []);

  const pushTrackPoint = useCallback((coords, force = false) => {
    if (!pathRecordingRef.current || !coords?.latitude) return;
    const elapsed = (Date.now() - pathStartMsRef.current) / 1000;
    const track = pathTrackRef.current;
    const last = track[track.length - 1];
    if (!force && last) {
      const dt = elapsed - last.t;
      if (dt < 1.5) return;
    }
    track.push({
      t: elapsed,
      lat: coords.latitude,
      lon: coords.longitude,
    });
  }, []);

  const requestAndStart = useCallback(async () => {
    update({ phase: "requesting", label: L.starting });

    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        update({ phase: "denied", granted: false, label: L.disabled });
        onCoords?.(null, L.disabled, false);
        return false;
      }

      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") {
        update({ phase: "denied", granted: false, label: L.denied });
        onCoords?.(null, L.denied, false);
        return false;
      }

      update({ phase: "starting", label: L.starting });

      const last = await Location.getLastKnownPositionAsync({ maxAge: 120000 });
      if (last?.coords) {
        coordsRef.current = last.coords;
        update({ phase: "ready", granted: true, label: L.active });
        onCoords?.(last.coords, L.active, true);
      }

      subRef.current?.remove();
      subRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 2000,
          distanceInterval: 2,
        },
        (loc) => {
          coordsRef.current = loc.coords;
          update({ phase: "ready", granted: true, label: L.active });
          onCoords?.(loc.coords, L.active, true);
          pushTrackPoint(loc.coords);
        }
      );

      if (!last?.coords) {
        update({ phase: "ready", granted: true, label: L.active });
      }
      return true;
    } catch {
      update({ phase: "denied", granted: false, label: L.error });
      onCoords?.(null, L.error, false);
      return false;
    }
  }, [L, onCoords, pushTrackPoint, update]);

  const stop = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
  }, []);

  const getCoords = () => coordsRef.current;

  const startPathRecording = useCallback(() => {
    pathTrackRef.current = [];
    pathStartMsRef.current = Date.now();
    pathRecordingRef.current = true;
    const c = coordsRef.current;
    if (c?.latitude != null && c?.longitude != null) {
      pathTrackRef.current.push({ t: 0, lat: c.latitude, lon: c.longitude });
    }
  }, []);

  const stopPathRecording = useCallback(() => {
    pathRecordingRef.current = false;
    const c = coordsRef.current;
    if (c?.latitude != null && c?.longitude != null) {
      pushTrackPoint(c, true);
    }
    const track = [...pathTrackRef.current];
    if (track.length === 1) {
      track.push({ ...track[0], t: Math.max(track[0].t, 1) });
    }
    const first = track[0];
    const last = track[track.length - 1];
    return {
      track,
      start: first ? { latitude: first.lat, longitude: first.lon } : null,
      end: last ? { latitude: last.lat, longitude: last.lon } : null,
    };
  }, [pushTrackPoint]);

  const openSettings = () => Linking.openSettings();

  return {
    status,
    requestAndStart,
    stop,
    getCoords,
    openSettings,
    startPathRecording,
    stopPathRecording,
  };
}
