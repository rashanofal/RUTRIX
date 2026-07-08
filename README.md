# RUTRIX — منصة ذكاء البنية التحتية للطرق

منصة متكاملة للكشف عن الحفر بالذكاء الاصطناعي، الخرائط التفاعلية، إدارة الصيانة، والتقارير البلدية.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/rashanofal/RUTRIX)

## النشر السحابي (رابط واحد)

بعد النشر على [Render](https://render.com):

| الخدمة | الرابط |
|--------|--------|
| لوحة التحكم | `https://rutrix.onrender.com` |
| تطبيق الموبايل (PWA) | `https://rutrix.onrender.com/mobile` |
| API | `https://rutrix.onrender.com/api/health` |

**حساب تجريبي:** `demo@pothole.app` / `demo1234`

## المكونات

| المكون | المسار |
|--------|--------|
| Backend API | `backend/` |
| Web Dashboard | `web-dashboard/` |
| Mobile (Expo) | `mobile/` |
| ML Model | `ml/models/pothole_yolov8n.pt` |

## تشغيل محلي

```bash
# Backend
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000

# Dashboard
cd web-dashboard && npm install && npm run dev
```

## تطبيق Android

APK جاهز من Expo — لا يُخزَّن في المستودع (حجمه كبير).

```powershell
powershell -File scripts\build-mobile.ps1
```

## الترخيص

MIT
