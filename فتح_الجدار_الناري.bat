@echo off
:: Auto-run as Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator permission...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo ========================================
echo   فتح الجدار الناري للموبايل
echo ========================================
echo.

netsh advfirewall firewall delete rule name="Pothole API 8000" >nul 2>&1
netsh advfirewall firewall delete rule name="Pothole Expo 8081" >nul 2>&1
netsh advfirewall firewall delete rule name="Pothole Node.js" >nul 2>&1

netsh advfirewall firewall delete rule name="Pothole API 8443" >nul 2>&1
netsh advfirewall firewall add rule name="Pothole API 8000" dir=in action=allow protocol=TCP localport=8000
netsh advfirewall firewall add rule name="Pothole API 8443" dir=in action=allow protocol=TCP localport=8443
netsh advfirewall firewall add rule name="Pothole Expo 8081" dir=in action=allow protocol=TCP localport=8081
netsh advfirewall firewall add rule name="Pothole Node.js" dir=in action=allow program="C:\Program Files\nodejs\node.exe" enable=yes

echo.
echo [OK] تم فتح المنافذ 8000 و 8443
echo.
echo الآن شغّلي START.bat ثم افتحي من الهاتف: http://IP:8000/mobile
echo.
pause
