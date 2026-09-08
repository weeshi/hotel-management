# Multi-Tenant Payment Gateways — خطة المرحلة v3.7 (SaaS Payments)

> **SUPERSEDED (v8).** The outbound gateway architecture was replaced by the Decoupled PMS Ledger (see `todo_v8.md`). The `PaymentProviderConfig` model became `IntegrationConfig`, `lib/gateways/*` and the webhook route were removed, and external engines now inject bookings + payment ledgers via the integrations API. Stripe/MobiCash env keys remain in `.env` as inert documentation.

## الهدف
دمج بوابات الدفع الليبية (MobiCash، Sadad، Tadawul) كبوابات متعددة المستأجرين — مفاتيح كل فندق مخزّنة مشفّرة في قاعدة البيانات وتُجلب ديناميكياً لكل طلب، مع توجيه موحّد عبر `PaymentService`، ومصادقة webhook ضد أسرار المستأجر المخزّنة، وإيديمبوتينسي صارمة، وواجهة إعدادات آمنة لمدير الفندق.

## المبادئ (وفق AGENTS.md المحدّث)
- **Section 9**: لا مفاتيح مستأجر في `.env` — مفاتيح التاجر في DB (مشفّرة AES-256-GCM عبر `PAYMENT_CRYPTO_KEY` العام) وتُجلب لكل طلب.
- **Section 14**: كل استعلام `Payment` مُقيّد بـ `hotelId`؛ `Payment.hotelId` مُنكّرم؛ الكيانات غير المملوكة → 404.
- **Section 16**: توجيه موحّد عبر المحولات؛ الـ webhook يحلّ المستأجر من السر المخزّن (وليس من البايلود)؛ الإيديمبوتينسي عبر `GatewayWebhook` (`@@unique([provider, eventId])`).
- سلسلة الوسائط: المسارات المعدِّلة `withAuth(withCsrf(withRateLimit(handler)))`.

## المهام المنفّذة
### المهمة 1 — المخطط
- [x] `PaymentProviderConfig` — مفاتيح التاجر لكل فندق (`@@unique([hotelId, provider])`)
- [x] `GatewayWebhook` — سجل إيديمبوتينسي (`@@unique([provider, eventId])`)
- [x] `Payment.hotelId` + `@@index([hotelId, status])` + ترحيل مع backfill

### المهمة 2 — الأمان والتشفير
- [x] `lib/utils/crypto.ts` — AES-256-GCM (encrypt/decrypt)
- [x] `PaymentService` — `createPaymentIntent` يجلب الإعداد + يفك التشفير + يبني المحول
- [x] `WebhookService` — حل المستأجر + الإيديمبوتينسي + تحديث مُقيّد بـ `hotelId`

### المهمة 3 — المحولات
- [x] `payment-gateway.interface.ts` — `GatewayCredentials` + `verifySignature` + `parseWebhook`
- [x] `mobicash.gateway.ts` / `stripe.gateway.ts` — إزالة env، اعتماد creds لكل طلب، HMAC
- [x] `sadad.gateway.ts` / `tadawul.gateway.ts` — محولات جديدة (منطق تنفيذي TODO للـ Tech Lead)

### المهمة 4 — المسارات
- [x] `POST /api/webhooks/[provider]` — استقبال موحّد (بدل `mobicash`/`stripe` المنفصلين)
- [x] `GET/PUT /api/admin/payment-providers[/[provider]]` + `/test` — سرّ مقنّع (`hasSecret`)
- [x] `payments/create` — `withRateLimit` + إعداد الفندق + `hotelId` على صفوف `Payment`

### المهمة 5 — الواجهة
- [x] `/admin/payment-gateways` — بطاقات كل بوابة + تفعيل + Sandbox/Live + Secret (password) + اختبار اتصال
- [x] رابط تنقّل في `(dashboard)/layout.tsx`

### الجودة
- [x] تحديث كل `prisma.payment.create` الحالية لإضافة `hotelId` (checkout/booking/restaurant/tests)
- [x] `tests/integration/payment-providers.test.ts` — النطاق، السر المقنّع، حل مستأجر الـ webhook، الإيديمبوتينسي
- [x] README — بوابات الدفع + API + changelog v3.7
- [x] Verification Gate: `npm run test` + `typecheck` + `lint` ✅

## النتيجة
- كل بوابات الدفع لكل مستأجر معزولة بالكامل.
- 146 اختبار سابق + اختبارات جديدة ✅
- الخادم على المنفذ 3001 — لا مفاتيح تُعاد في أي استجابة.

## ملاحظات لاحقة
- ربط تسوية الفاتورة (folio settlement) داخل معالجة الـ webhook عند النجاح — يحتاج دعم `FolioRepository` لـ `$transaction`.
- منطق التنفيذ الفعلي لمحولي Sadad/Tadawul (endpoints/التوقيع الرسمي) — `TODO: Tech Lead` في AGENTS.md Section 9.
