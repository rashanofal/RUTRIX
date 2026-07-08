@echo off

chcp 65001 >nul

cd /d "%~dp0"

echo.

echo ========================================

echo   RUTRIX Mobile Build

echo   Android APK + iOS IPA

echo ========================================

echo.



where node >nul 2>&1

if errorlevel 1 (

  echo [!] Node.js not installed

  pause

  exit /b 1

)



cd mobile



echo [1] Generate app icons...

..\backend\.venv\Scripts\python.exe ..\scripts\generate-app-icons.py 2>nul



echo.

echo Requirements (once):

echo   npx eas-cli login

echo   npx eas-cli init

echo   Set server URL: powershell -File ..\scripts\set-cloud-url.ps1 -Url "https://YOUR-URL"

echo.

echo [1] Android APK   - install directly on phone

echo [2] Android AAB   - Google Play Store

echo [3] iOS IPA       - iPhone install (Apple Developer 99 USD/year)

echo [4] EAS init      - link Expo project (first time)

echo.

set /p choice="Choice (1/2/3/4): "



if "%choice%"=="4" (

  call npx eas-cli init

  pause

  exit /b 0

)



if "%choice%"=="1" (

  echo.

  echo Building APK... download link in ~15-20 min at expo.dev

  call npx eas-cli build -p android --profile preview --non-interactive

) else if "%choice%"=="2" (

  call npx eas-cli build -p android --profile production --non-interactive

) else if "%choice%"=="3" (

  echo.

  echo Building iOS IPA for internal install...

  call npx eas-cli build -p ios --profile preview --non-interactive

) else (

  echo Invalid choice

)



echo.

echo Track build: https://expo.dev

pause

