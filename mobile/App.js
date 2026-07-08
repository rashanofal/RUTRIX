import { useEffect, useRef, useState } from "react";

import { View, ActivityIndicator, StyleSheet } from "react-native";

import { StatusBar } from "expo-status-bar";

import * as SplashScreen from "expo-splash-screen";

import { checkHealth } from "./src/api";

import { getStoredAuth, clearAuth } from "./src/auth";

import { useGps } from "./src/hooks/useGps";

import { detectApiUrl, getSavedApiUrl, saveApiUrl } from "./src/storage";

import { LocaleProvider, useLocale } from "./src/LocaleContext";

import TabBar from "./src/components/TabBar";

import BrandLogo from "./src/components/BrandLogo";

import LoginScreen from "./src/screens/LoginScreen";

import CameraScreen from "./src/screens/CameraScreen";

import MapScreen from "./src/screens/MapScreen";

import ActivityScreen from "./src/screens/ActivityScreen";

import ProfileScreen from "./src/screens/ProfileScreen";

import GpsPermissionScreen from "./src/screens/GpsPermissionScreen";

import { colors } from "./src/theme";



SplashScreen.preventAutoHideAsync().catch(() => {});



function AppInner() {

  const { locale } = useLocale();

  const [auth, setAuth] = useState(null);

  const [booting, setBooting] = useState(true);

  const [gpsGateDone, setGpsGateDone] = useState(false);

  const [tab, setTab] = useState("camera");

  const [apiUrl, setApiUrl] = useState(detectApiUrl());

  const [connected, setConnected] = useState(false);

  const [gpsReady, setGpsReady] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  const coordsRef = useRef(null);



  const { status: gpsStatus, requestAndStart, getCoords } = useGps(

    (coords, _label, ready) => {

      coordsRef.current = coords;

      setGpsReady(ready);

    },

    locale

  );



  useEffect(() => {

    (async () => {

      const saved = await getSavedApiUrl();

      const detected = detectApiUrl();

      setApiUrl(saved || detected);

      const stored = await getStoredAuth();

      if (stored) setAuth(stored);

      setBooting(false);

      SplashScreen.hideAsync().catch(() => {});

    })();

  }, []);



  useEffect(() => {

    if (!auth) return;

    const ping = async () => setConnected(await checkHealth(apiUrl));

    ping();

    const t = setInterval(ping, 15000);

    return () => clearInterval(t);

  }, [auth, apiUrl]);



  const handleApiChange = async (url) => {

    setApiUrl(url);

    await saveApiUrl(url);

  };



  const handleUploaded = () => setRefreshKey((k) => k + 1);



  const handleLogout = async () => {

    await clearAuth();

    setAuth(null);

    setTab("camera");

  };



  if (booting) {

    return (

      <View style={styles.boot}>

        <BrandLogo size="lg" />

        <ActivityIndicator size="large" color={colors.primary} style={styles.bootSpinner} />

      </View>

    );

  }



  if (!gpsGateDone) {

    return (

      <GpsPermissionScreen

        status={gpsStatus}

        onRequest={requestAndStart}

        onContinue={() => setGpsGateDone(true)}

      />

    );

  }



  if (!auth) {

    return (

      <LoginScreen

        apiUrl={apiUrl}

        onLoggedIn={async (data, url) => {

          if (url) await handleApiChange(url);

          setAuth(data);

        }}

      />

    );

  }



  return (

    <View style={styles.root}>

      <StatusBar style="light" />

      <View style={styles.body}>

        {tab === "camera" && (

          <CameraScreen

            apiUrl={apiUrl}

            connected={connected}

            gpsReady={gpsReady}

            getCoords={() => coordsRef.current || getCoords()}

            onUploaded={handleUploaded}

            orgName={auth.organization?.name}

          />

        )}

        {tab === "map" && <MapScreen apiUrl={apiUrl} refreshKey={refreshKey} />}

        {tab === "activity" && (

          <ActivityScreen apiUrl={apiUrl} refreshKey={refreshKey} />

        )}

        {tab === "profile" && (

          <ProfileScreen

            auth={auth}

            apiUrl={apiUrl}

            onApiUrlChange={handleApiChange}

            onLogout={handleLogout}

          />

        )}

      </View>

      <TabBar active={tab} onChange={setTab} />

    </View>

  );

}



export default function App() {

  return (

    <LocaleProvider>

      <AppInner />

    </LocaleProvider>

  );

}



const styles = StyleSheet.create({

  root: { flex: 1, backgroundColor: colors.bg },

  body: { flex: 1 },

  boot: {

    flex: 1,

    backgroundColor: colors.bg,

    justifyContent: "center",

    alignItems: "center",

    gap: 24,

  },

  bootSpinner: { marginTop: 8 },

});


