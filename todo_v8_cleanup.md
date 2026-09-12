# Sanity Check & Cleanup — todo_v8_cleanup.md

> فحص شامل ومعالجة الديون التقنية وتناسق الواجهة قبل بدء بناء Public Booking API (بعد موافقة CEO على انتقال v8 Decoupled PMS Ledger).

## المهام

### المهمة 1 — تحديث قوائم طرق الدفع في واجهة الاستقبال
- [x] تحديد مكوّنات الدفع الأمامية (`PaymentModal`, `CheckoutModal`, `CheckInPaymentModal`...)
- [x] إضافة `BANK_TRANSFER` إلى تعداد `PaymentMethod` المشترك (مع `SADAD` / `TADAWUL` الموجودين) إن لم يكن موجوداً
- [x] تحديث خيارات القوائم المنسدلة لتعكس السوق الليبي بدقة (نقدي، موبي كاش، سداد، تدوال، تحويل بنكي...) للتسجيل اليدوي في الـ Ledger

### المهمة 2 — تنظيف الديون التقنية
- [x] `npm uninstall stripe` من `apps/web` (لا توجد بوابات خارجة بعد الآن)
- [x] إزالة متغيرات البوابات القديمة (مثل `STRIPE_*`, `MOBICASH_*`) من `.env.example` أو أي توثيق `.env`

### المهمة 3 — توثيق متطلبات حمولة OTA
- [x] إضافة تحذير واضح في `README.md` (ضمن قسم Integration API) بأن normalizers الخاصين بـ `booking.com` و `expedia` حالياً "بدائل تقريبية (best-effort placeholders)" ويجب تحديثهما بعينات JSON حقيقية من قِبل Tech Lead قبل الإطلاق

### المهمة 4 — توثيق استراتيجية ربط الغرف
- [x] إضافة قسم "Future Architecture: Channel Manager & Room Mapping" في `README.md`
- [x] توضيح أن تكاملات OTA المستقبلية ستتطلب جدول ربط في قاعدة البيانات يصل رموز أنواع الغرف الخارجية (مثل `DBL-ROOM`) بمعرّفات `roomId` UUID الداخلية

> **قاعدة تنفيذ:** تُنفَّذ المهام واحداً تلو الآخر (ONE BY ONE). بعد إنهاء كل مهمة — توقّف، أبلغ بالنتيجة، وانتظر الأمر للانتقال إلى التالية.
