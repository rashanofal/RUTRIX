---
title: RUTRIX
emoji: 🛣️
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# RUTRIX — Road Infrastructure Intelligence

منصة ذكاء البنية التحتية للطرق وإدارة الأصول.

- **Dashboard:** `/`
- **Mobile:** `/mobile`
- **Demo:** `demo@pothole.app` / `demo1234`

## حفظ الصور والبيانات (مهم)

على Hugging Face، القرص الافتراضي **مؤقت** — عند كل تحديث أو إعادة تشغيل للتطبيق تُمسح قاعدة البيانات والصور.

**لحفظ دائم** (لا يُحذف إلا بالحذف اليدوي من المنصة):

1. من [إعدادات الـ Space](https://huggingface.co/spaces/Rashanofal8/rutrix/settings) → **Storage** → **Create bucket**
2. اسم مقترح: `Rashanofal8/rutrix-data`
3. اربطي الـ Bucket على المسار: **`/data`**
4. أعيدي تشغيل الـ Space (Factory reboot)

RUTRIX يخزّن تلقائياً في:
- قاعدة البيانات: `/data/pothole.db`
- الصور: `/data/uploads/`

**إذا ظهر خطأ Scheduling failure:** من إعدادات الـ Space → **Factory reboot** (أو انتظري 10–15 دقيقة ثم أعيدي المحاولة — مشكلة مؤقتة في خوادم HF المجانية).

**الحذف:** الصور لا تُحذف عند تحديث الصفحة (F5). الحذف يتم فقط عند ضغط حذف (المستخدم لصوره، أو المشرف/المالك لأي صورة).
