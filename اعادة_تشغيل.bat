@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo   اغلاق السيرفرات واعادة التشغيل
echo ========================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-all.ps1"
timeout /t 2 /nobreak >nul
call "%~dp0START.bat"
