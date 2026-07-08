@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ╔══════════════════════════════════════════════╗
echo ║     نشر كشف الحفر على السحابة (مجاني)      ║
echo ╚══════════════════════════════════════════════╝
echo.
echo  الخطوات:
echo  ─────────────────────────────────────────────
echo  1. ارفعي المشروع على GitHub (مجاني)
echo  2. ادخلي render.com وسجّلي بحساب GitHub
echo  3. New ^> Blueprint ^> اختاري المستودع
echo  4. Render يقرأ render.yaml تلقائياً
echo  5. انتظري 10-15 دقيقة (أول بناء بطيء)
echo  6. انسخي الرابط: https://pothole-detection-xxxx.onrender.com
echo.
echo  بعد النشر:
echo  ─────────────────────────────────────────────
echo  • لوحة التحكم:  https://YOUR-URL.onrender.com
echo  • تطبيق iPhone:  https://YOUR-URL.onrender.com/mobile
echo  • الدخول:        demo@pothole.app / demo1234
echo.
echo  لتحديث رابط التطبيق الأصلي (APK/iOS):
echo  powershell -File scripts\set-cloud-url.ps1 -Url "https://YOUR-URL.onrender.com"
echo.
echo  ملاحظة: الخطة المجانية تنام بعد 15 دقيقة — أول فتح يأخذ ~30 ثانية
echo.
set /p open="فتح render.com الآن؟ [y/N]: "
if /i "%open%"=="y" start https://dashboard.render.com/blueprints
pause
