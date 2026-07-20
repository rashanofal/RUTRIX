# RUTRIX — Google Play publishing checklist

## Prerequisites

1. **Google Play Console** account ($25 one-time fee)
2. **Expo EAS** account linked to project `rashanofal/rutrix`
3. **Service account** JSON for Play API (never commit to git)

## 1. Build production AAB

From repo root:

```powershell
.\scripts\build-play.ps1 -Url "https://rashanofal8-rutrix.hf.space"
```

Or manually:

```powershell
.\scripts\build-mobile.ps1 -Url "https://rashanofal8-rutrix.hf.space"
cd mobile
npx eas-cli build -p android --profile production
```

Output: `.aab` (Android App Bundle) — required for Play Store.

## 2. Play Console setup

1. Create app **RUTRIX** with package `com.rutrix.app`
2. Complete **Store listing** (AR + EN): screenshots, short/full description, icon
3. **Privacy policy** URL (required) — host on your domain or GitHub Pages
4. **Data safety** form: camera, location, photos
5. **Content rating** questionnaire
6. Upload **AAB** to **Internal testing** track first

## 3. Service account for automated submit

1. Play Console → Setup → API access → Link Google Cloud project
2. Create service account with **Release manager** role
3. Download JSON key → save as `mobile/google-service-account.json`
4. `eas.json` already points to `./google-service-account.json`

Submit after build:

```powershell
cd mobile
npx eas-cli submit -p android --profile production --latest
```

## 4. After publish

Set the Play Store URL in `web-dashboard/src/brand.js`:

```js
playStoreUrl: "https://play.google.com/store/apps/details?id=com.rutrix.app",
```

## Version bumps

Before each release, update in `mobile/app.json`:

- `version` (semver, user-visible)
- `android.versionCode` (integer, must increase)
- `ios.buildNumber` (if publishing iOS later)

## Beta APK (before Play)

Internal testers can install the preview APK from EAS or `releases/RUTRIX-android.apk`.
Set `androidBetaApkUrl` in `brand.js` for the dashboard download link.
