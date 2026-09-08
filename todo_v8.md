# Decoupled PMS Ledger — خطة المرحلة v8 (External Booking Injection)

## الهدف
استبدال بنية البوابات الخارجة (v3.7) بالكامل: الـ PMS يعمل كـ PMS + Ledger فقط. محركات الحجز الخارجية (Booking.com، Expedia، الموقع) تجمع المدفوعات بنفسها، ثم تحقن الحجوزات المؤكدة وسجل المدفوعات عبر API آمن بمفتاح لكل فندق. الاستقبال يتحقق بصرياً من التحويلات ويسجّل المدفوعات يدوياً.

## المبادئ (وفق AGENTS.md §16 المحدّث)
- **حِقن أحادي الاتجاه فقط**: لا مكالمات بوابة خارجة من الـ PMS إطلاقاً.
- **مصادقة بمفتاح لكل فندق**: `IntegrationConfig.apiKeyEnc` (AES-256-GCM عبر `PAYMENT_CRYPTO_KEY`)، تُحلّ من الـ DB لكل طلب، والمستأجر من صف الـ DB لا من البايلود.
- **عزل تام**: كل الاستعلامات مقيدة بـ `hotelId`؛ الغرف غير المملوكة → 400؛ إعدادات غير مملوكة → 404.
- **إيديمبوتينسي**: `GatewayWebhook` بـ `@@unique([provider, hotelId, eventId])` داخل معاملة واحدة.
- **أرقام الحجز**: `bookingNo` فريدة عالمياً (`@@unique`)؛ التسلسل عام وليس لكل فندق.

## المهام
### المهمة 1 — المخطط
- [x] `PaymentProviderConfig` → `IntegrationConfig` (`hotelId`, `engine`, `apiKeyEnc`, `isActive`, `config`, `@@unique([hotelId, engine])`)
- [x] `GatewayWebhook.hotelId` إلزامي + `@@unique([provider, hotelId, eventId])`
- [x] `Booking.externalRef` + `@@unique([hotelId, externalRef])`؛ `Payment.externalRef`
- [x] `tests/helpers/db.ts` resetDb → `integrationConfig`؛ `prisma db push` + `generate` ✅

### المهمة 2 — حِقن الحجز
- [x] `lib/integrations/normalizers.ts` — `SUPPORTED_ENGINES` + شكل موحّد + محوّلات per-engine
- [x] `middlewares/external-auth.ts` — `x-api-key` بمطابقة ثابتة الزمن، حلّ المستأجر من الـ DB
- [x] `lib/services/integration.service.ts` — معاملة واحدة: webhook + حجز CONFIRMED + folio + إيجار + دفع SUCCEEDED + تسوية؛ P2002 → `duplicate:true`
- [x] `POST /api/integrations/[engine]/bookings` — بلا CSRF/rate-limit (مستأمنون، دفتر إيديمبوتينس)

### المهمة 3 — الإزالة
- [x] حذف `lib/gateways/*` بالكامل + `webhook.service.ts` + `api/webhooks/[provider]` + `api/admin/payment-providers/*`
- [x] حذف `tests/integration/payment-providers.test.ts`
- [x] إزالة `createGatewayPaymentIntent` من `payment.service.ts`
- [x] إعادة كتابة `payments/create`: تسجيل يدوي SUCCEEDED لكل طريقة، `externalRef`، بلا فرع بوابة

### المهمة 4 — الواجهة
- [x] `api/admin/integrations` (GET/POST) + `[engine]` (GET/PATCH) + `[engine]/key` (POST توليد 32-byte hex، يُعاد مرة واحدة)
- [x] صفحة `/admin/integrations` (4 بطاقات محرّك، تفعيل، توليد/تدوير مفتاح) + حذف `payment-gateways/page.tsx` + تحديث رابط التنقل

### المهمة 5 — الاختبارات والوثائق
- [x] `tests/integration/external-bookings.test.ts` — 13 اختبار (تسجيل، قناع المفتاح، الحِقن، idempotency، عزل المستأجر، التطبيع) ✅
- [x] إصلاح عزل المستأجر: تسلسل `bookingNo` عام + غرفة مملوكة للفندق الثاني ✅
- [x] AGENTS.md §16 → External Booking & Ledger Integration؛ §9 يحدّث إلى `IntegrationConfig`
- [x] `todo_v7.md` معلَّمة كمُتجاوزة + إنشاء `todo_v8.md`
- [x] README — إعادة المزامنة (واجهات، خطة، أعداد الاختبارات)

### الجودة
- [ ] Verification Gate النهائي: `npm run test` + `typecheck` + `lint` من `apps/web`
- [ ] إعادة تشغيل الخادم على المنفذ 3001 + فحص يدوي سريع

## النتيجة
- الـ PMS لا يتصل بأي بوابة خارجية؛ المحركات تحقن مدفوعاتها كسجل ledger مُعزل لكل فندق.
- 17 ملف اختبار — 146 اختبار سابق + 13 اختبار حِقن جديد.
