# 🏨 نظام إدارة الفنادق v8.3 — Hotel Management System

منصة متكاملة لإدارة الفنادق مع حجوزات، محفظة نقدية (Wallet)، فوترة فندقية (Folio Billing)، دفتر Ledger مفكوك (Decoupled PMS Ledger) مع حقن الحجوزات الخارجية، صندوق أمانات (Safe Deposit)، مطعم (POS)، تدبير منزلي (Housekeeping)، مكتب مفقودات (Lost & Found)، حجوزات مجموعات (Group Bookings)، Tape Chart تفاعلي، محرك مالي متكامل، و API للربط مع المنظومات العالمية.

> **الفرع الحالي:** `feature/channel-manager-integration`
> **البوابة:** `http://localhost:3210`
> **قاعدة البيانات:** PostgreSQL `localhost:5432/hotel_management` + Redis `localhost:6379`

---

## 🚀 التشغيل السريع

### المتطلبات
- Node.js 20+
- Docker Desktop
- npm 10+

### 1. تشغيل قواعد البيانات
```bash
docker compose up -d
```
يُشغّل PostgreSQL (منفذ 5432) و Redis (منفذ 6379).

### 2. تثبيت الاعتماديات
```bash
npm install
```

### 3. إعداد قاعدة البيانات
```bash
cd apps/web
npx prisma migrate dev
npx prisma db seed
```

### 4. تشغيل التطبيق
```bash
npm run dev
```
يفتح على: **http://localhost:3210**

### 5. تشغيل Worker غير المتزامن (اختياري للتطوير)
```bash
npm run worker:cm
```
يُشغّل عامل BullMQ الوحيد الذي يستهلك جميع طوابير `cm-*` على `localhost:6379`.

### أوامر مفيدة
| الأمر | الوصف |
|-------|--------|
| `npm run dev` | تشغيل التطبيق (منفذ 3210) |
| `npm run build` | بناء التطبيق للإنتاج |
| `npm test` | تشغيل اختبارات الوحدة (Vitest) |
| `npm run typecheck` | التحقق من الأنواع (TypeScript) |
| `npm run lint` | فحص الكود (ESLint) |
| `npm run db:studio` | فتح Prisma Studio |
| `npm run db:migrate` | إنشاء ترحيل جديد لقاعدة البيانات |
| `npm run worker:cm` | تشغيل عامل BullMQ الوحيد (pqueues `cm-*`) |
| `npm run worker:dev` | تشغيل Worker + web معاً (محلياً عبر tsx) |

### حسابات الاختبار
| البريد | كلمة المرور | الصلاحية |
|--------|------------|----------|
| super@hotel.com | superadmin123 | المشرف العام على المنصة (Super Admin) |
| admin@hotel.com | admin123 | مدير النظام (Admin) |
| reception@test.com | TestPass123 | موظف استقبال (Reception) |

---

## 📁 هيكل المشروع

```
hotel-management/
├── apps/web/                    ← Next.js (Frontend + API Routes)
│   ├── prisma/
│   │   ├── schema.prisma       ← 45+ نموذج بيانات
│   │   ├── migrations/          ← ترحيلات
│   │   ├── rls/rls.sql          ← خراج RLS المُصدَّر من apply-rls.ts (M8)
│   │   └── seed.ts
│   ├── scripts/                 ← أدوات DB (provision-db-roles, apply-rls, generate-child-hotelid-migration, e2e-prepare-db, …)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (public)/        ← موقع العملاء (حجز عام)
│   │   │   ├── (dashboard)/
│   │   │   │   ├── superadmin/  ← لوحة التحكم العليا (فنادق + دعوات)
│   │   │   │   ├── admin/       ← 21 صفحة إدارة
│   │   │   │   ├── manager/     ← لوحة المدير
│   │   │   │   ├── reception/   ← 18 صفحة استقبال
│   │   │   │   ├── housekeeping/← لوحة التدبير المنزلي
│   │   │   │   └── maintenance/ ← لوحة الصيانة
│   │   │   ├── access-denied/
│   │   │   └── api/             ← 88+ API Route
│   │   ├── components/
│   │   │   ├── bookings/        ← حجوزات (5 مكوّنات)
│   │   │   ├── checkin/         ← تسجيل الوصول/المغادرة (7)
│   │   │   ├── folio/           ← الفوترة (11)
│   │   │   ├── group-bookings/  ← حجوزات المجموعات (3)
│   │   │   ├── guests/          ← النزلاء (10)
│   │   │   ├── housekeeping/    ← التدبير المنزلي (4)
│   │   │   ├── lost-found/      ← المفقودات (5)
│   │   │   ├── pos/             ← نقاط البيع (5)
│   │   │   ├── reports/         ← التقارير (6)
│   │   │   ├── room-types/      ← أنواع الغرف (1)
│   │   │   ├── safe-deposit/    ← صندوق الأمانات (5)
│   │   │   ├── safeboxes/       ← الخزن (2)
│   │   │   ├── tape-chart/      ← Tape Chart تفاعلي (1)
│   │   │   ├── wallet/          ← المحفظة (3)
│   │   │   ├── worker/          ← العامل (1)
│   │   │   └── ui/              ← مكوّنات عامة (11)
│   │   ├── contexts/            ← React Contexts (Auth)
│   │   ├── hooks/               ← Custom Hooks
│   │   ├── lib/
│   │   │   ├── integrations/     ← محوّلات حقن الحجز الخارجي (normalizers)
│   │   │   ├── queue/            ← طابور المهام (BullMQ: redis.ts, bullmq.ts)
│   │   │   ├── repositories/     ← طبقة الوصول للبيانات (3)
│   │   │   ├── services/         ← منطق الأعمال (16)
│   │   │   └── utils/            ← أدوات مساعدة (CSRF, Toast, API Client)
│   │   ├── middlewares/         ← Auth, CSRF, Rate Limit, External-Auth, Validate
│   │   ├── middleware.ts        ← Next.js Edge Middleware
│   │   └── workers/             ← عمال BullMQ (index.ts, queue.ts, jobs/*.job.ts)
│   └── tests/
│       ├── unit/                ← 4 ملفات اختبار وحدة
│       └── integration/         ← 14 ملف اختبار تكامل
├── packages/shared/             ← أنواع مشتركة + Zod schemas + Enums + Permissions
├── docker-compose.yml           ← PostgreSQL + Redis
├── railway.toml                 ← نشر Railway (web + worker-cm)
└── package.json                 ← Monorepo (npm workspaces)
```

## 🏗️ العمارة

```
HTTP/HTTPS
    ↓
Next.js API Routes (Edge Middleware → API Route Handler)
    ↓
Middlewares Layer (Auth JWT → CSRF → Rate Limiter → Zod Validation)
    ↓
Service Layer (منطق الأعمال — $transaction لضمان الذرية)
    ↓
Repository Layer (Prisma ORM — فصل تام عن منطق الأعمال)
    ↓
PostgreSQL + Redis (تخزين مؤقت + طوابير BullMQ)
    ↓
Worker Service (cm-availability-snapshot, cm-availability-publish,
                cm-booking-ingest, cm-rates-push, cm-inventory-reconcile)
```

### المبادئ المعمارية
- **Micro-Modularization:** كل صفحة مقسمة إلى مكوّنات صغيرة أحادية الغرض
- **Separation of Concerns:** فصل تام بين UI ومنطق الأعمال وقاعدة البيانات
- **Atomicity:** كل عملية تعدّل جداول متعددة ملفوفة في `prisma.$transaction`
- **State Machines:** تحديث الحالات عبر مصفوفة انتقالية صارمة (لا تقبل String عشوائي)
- **Financial Ledger:** نظام Folio كدفتر أستاذ مالي مع تتبع كل معاملة

---

## ✨ الميزات الرئيسية

### 🏠 إدارة الحجوزات (Bookings)
- حجوزات عامة (موقع العملاء) + حجوزات استقبال يدوية
- **تدفق حجز عام (Phase 2):** تقويم تواريخ (Check-in/Check-out) + عدد البالغين/الأطفال → فحص التوفر الفوري عبر `GET /api/public/availability` → اختيار الغرفة مع السعر والإجمالي وسياسة الإلغاء → نموذج بيانات الضيف → إنشاء الحجز → صفحة تأكيد تعرض رقم الحجز وملخص الإقامة وإرشادات الدفع (نقداً عند الوصول / تحويل بنكي)
- **استعلام ضيف عن الحجز:** `GET /api/public/bookings?bookingNo=...&email=...` يعرض تفاصيل الحجز للضيف بعد التحقق من البريد/الهاتف
- **لوحة تحكم الموقع (Phase 3):** `WebsiteSetting` لكل فندق (تفعيل الحجز أونلاين، نسبة ضريبة، رسوم حجز ثابتة، نسبة خصم، مهلة تأكيد `confirmationCutoffHours`) + صفحة `/admin/website-settings` (ADMIN فقط) + `GET/PUT /api/admin/website-settings` + حاسبة تسعير نقية `computeWebPricing` (خصم قبل الضريبة)
- **محرك التوفر والتسعير للويب (Phase 3):** `GET /api/public/availability` يعيد أنواع الغرف (`isWebVisible` فقط) مع حصة `onlineAvailable = min(webRoomLimit − طلبات PENDING، الغرف الفيزيائية المتاحة)` + السعر `webPrice` (بديل `baseRate`/خطة السعر) + تفصيل مالي كامل (إجمالي/ضريبة/رسوم/خصم/نهائي) عبر `computeWebPricing`
- تسجيل الوصول/المغادرة مع حالات (PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT)
- تعديل الحجز (PATCH) مع إعادة حساب الفوترة عند تغيير التواريخ/الغرف
- منع تسجيل الوصول المبكر (قبل تاريخ checkIn)
- إلغاء الحجز مع سياسات الإلغاء والاسترداد
- نقل الغرفة (Room Move) — تحويل الفوترة + تغيير حالة الغرف + إنشاء مهام تدبير
- تمديد الإقامة (Stay Extension) — إعادة حساب الرسوم + التحقق من التوفر عبر كل الغرف

### 👥 حجوزات المجموعات (Group Bookings)
- Master Folio موحّد للمجموعة مع Sub-Folios فردية
- قواعد توجيه (Routing Rules) حسب نوع المصروف (غرفة، خدمة، مطعم، ضريبة، خصم)
- نظام تلقائي لتوجيه الرسوم: قاعدة صريحة → Master Folio → Folio الحجز الفردي
- دمج كامل مع نظام الفوترة والمحفظة والمدفوعات

### 📊 Tape Chart تفاعلي
- تقويم بصري تفاعلي بالسحب والإفلات لعرض إشغال الغرف
- سحب لنقل الحجز إلى غرفة أخرى
- سحب الحافة اليمنى لتمديد الإقامة
- ترميز لوني حسب حالة الحجز (CHECKED_IN / CONFIRMED / PENDING)
- تجميع حسب الطوابق
- تمييز اليوم الحالي وعطلات نهاية الأسبوع

### 💰 المحفظة النقدية (Wallet)
- لكل نزيل محفظة إلكترونية بعملة LYD
- إيداع/سحب (Deposit/Withdrawal)
- ترحيل الديون (Debt Migration) — إذن ائتماني مع حقل `allowCredit`
- تجميد/إلغاء تجميد المحفظة
- كشف حساب PDF
- صلاحيات صارمة: ADMIN/MANAGER فقط للترحيل

### 📄 نظام الفوترة (Folio Billing)
- فواتير بنظام Folio مع Transactions
- إضافة رسوم (غرف، خدمات، مطعم)
- خصومات (Percentage / Fixed)
- دفع (تسجيل يدوي: نقدي/موبي كاش/محفظة + حقن محرك خارجي)
- تسوية (Settle) / إعادة فتح تلقائي عند إضافة رسوم جديدة
- فاتورة PDF
- إلغاء معاملة (Void) عبر إدخال قيد عكسي
- معالجة الرسوم الليلية (Scheduled Charges)

### 🏦 المحرك المالي (Financial Engine)
- **Folio** كدفتر أستاذ مالي مع حقول denormalized (`totalCharges`, `totalPaid`, `balance`)
- **قسائم يومية (Room Charges):** لكل غرفة لكل ليلة مع تتبع ضريبي
- **تسوية صارمة عند المغادرة:** حظر cut-off إذا كان الرصيد > 0 — لا يمكن المغادرة قبل التسديد
- **ترحيل الديون:** ADMIN/MANAGER يمكنهم ترحيل الرصيد غير المدفوع إلى محفظة النزيل
- **سياسات الإلغاء:** نظام هرمي (RatePlan → الحجز → Policy افتراضي للفندق) مع قواعد استرداد متدرجة
- **حجوزات المجموعات:** Master Folio مع توجيه الرسوم حسب القواعد

### 👥 إدارة النزلاء (Guests)
- ملف نزيل كامل مع تاريخ الحجوزات
- محفظة النزيل وبطاقة الرصيد
- بحث ذكي (Combobox)
- status badge
- صلاحية الائتمان (allowCredit toggle — ADMIN/MANAGER فقط)

### 🧹 التدبير المنزلي (Housekeeping)
- مهام تنظيف لكل غرفة
- حالات: PENDING → IN_PROGRESS → COMPLETED
- لوحتي Admin و Reception و Housekeeping
- تقارير Housekeeping

### 🔐 صندوق الأمانات (Safe Deposit)
- صناديق أمانات مرتبطة بالغرف أو عملاء خارجيين
- إيداع/سحب عناصر مع توقيع
- إغلاق الصندوق
- لوحتي Admin و Reception

### 🍽️ المطعم (POS / Restaurant)
- قائمة طعام (Menu Categories + Items)
- سلة طلبات
- أوامر نشطة + تحصيل
- إضافة الرسوم إلى Folio النزيل

### 📦 المفقودات (Lost & Found)
- تسجيل عناصر مفقودة/موجودة
- استرداد (Claim) / تخلص (Dispose)
- حالات متعددة + صلاحيات

### 📊 التقارير (Reports)
- إشغال الغرف (Occupancy)
- إيرادات (Revenue)
- تدبير منزلي
- مطعم
- محفظة
- صندوق أمانات
- تصدير + مشاركة

### 🔌 التكامل الخارجي — Decoupled PMS Ledger + Channel Manager
> **v8:** الـ PMS لا يتصل بأي بوابة دفع خارجية. محركات الحجز (Booking.com، Expedia، الموقع الإلكتروني) تجمع المدفوعات بنفسها ثم تحقن الحجوزات المؤكدة + سجل المدفوعات عبر API آمن. الاستقبال يتحقق بصرياً من التحويلات ويسجّل المدفوعات يدوياً.
>
> **v8.4 (Sprint 2 + Phase 0/1):** تم إضافة **Channel Manager** مع مدير القنوات (`ChannelManagerService`) ونماذج `ChannelProvider`/`ChannelMapping`/`ChannelPriceSnapshot`. يتم بناء لقطات التوفر/الأسعار (`buildAvailabilitySnapshot`) وتخزينها، ثم نشرها إلى OTAs عبر طابور `cm-availability-publish` (مُعالج `pushToOTA` — قيد التنفيذ في Phase 2). الحجوزات الواردة من OTAs تُستقبل عبر `POST /api/external/channel/[provider]/bookings` مع Idempotency عبر `externalRef` + `@@unique([hotelId, externalRef])`. لوحة المراقبة `/admin/queues` (Bull Board) متاحة لـ SUPER_ADMIN فقط.

| المكوّن | الوصف |
|---------|--------|
| `POST /api/integrations/[engine]/bookings` | حقن حجز مؤكد + دفع SUCCEEDED + تسوية folio في معاملة واحدة |
| مصادقة `x-api-key` لكل فندق | مفتاح مشفّر AES-256-GCM في `IntegrationConfig`، مطابقة ثابتة الزمن، المستأجر من الـ DB |
| دفتر Idempotency | `GatewayWebhook` بـ `@@unique([provider, hotelId, eventId])` — إعادة الإرسال تُجاب `duplicate:true` |
| `/admin/integrations` | إدارة المحركات (Booking.com / Expedia / Website / Custom) + توليد/تدوير المفتاح (يُعرض مرة واحدة) |
| `payments/create` | تسجيل يدوي SUCCEEDED لأي طريقة (نقدي، موبي كاش، ...) — بلا فرع بوابة |
| **Channel Manager APIs** | **Sprint 2:** `GET/POST /api/admin/channel-manager/mappings`, `PATCH /api/admin/channel-manager/mappings/[id]`, `GET /api/admin/channel-manager/preview`, `POST /api/admin/channel-manager/publish` (202 — enqueues pushToOTA jobs) |
| **Inbound OTA Webhook** | `POST /api/external/channel/[provider]/bookings` (تحويل فوري إلى job `cm-booking-ingest`) |
| **Bull Board Dashboard** | `/admin/queues` (Hono + BullMQAdapter) — SUPER_ADMIN فقط، محمي بـ Cookie |

### طرق الدفع المسجّلة في الـ Ledger
| الطريقة | الحالة |
|---------|--------|
| نقدي (Cash) | ✅ تسجيل يدوي من الاستقبال |
| بطاقة (Card) | ✅ تسجيل يدوي / حقن من المحرك |
| حوالة بنكية (Bank Transfer) | ✅ تسجيل يدوي |
| سداد / تدوال (Sadad / Tadawul) | ✅ تسجيل يدوي |
| نقاط بيع (POS) | ✅ تسجيل يدوي من المطعم |
| موبي كاش (Libyana) | ✅ تسجيل يدوي / حقن من المحرك |
| محفظة داخلية (Wallet) | ✅ تحويل مباشر عبر `WalletService` |
| حقن محرك خارجي | ✅ SUCCEEDED تلقائياً مع `externalRef` و `gateway` |

> تعداد `PaymentMethod` موحّد بين `schema.prisma` و `@hotel/shared` (v8.1) — أي إضافة طريقة دفع جديدة يجب أن حدّث الطرفين معاً.

### 🏦 بوابات الدفع المحلية للحجوزات المباشرة (Local Gateways — v8.7+)

> **السيناريو:** حجوزات الأفراد المباشرة من موقع الفندق (Public Booking) بالدفع الإلكتروني عبر بوابات ليبية (Plutu / T-Lync). الـ PMS لا يتواصل مع البوابة مباشرة — الجلسة تبدأ عبر API، المستخدم يُوجّه لصفحة الدفع، والـ Webhook يعيد التأكيد ليسوي الـ Ledger.

**النماذج الجديدة:**
| النموذج | الوظيفة |
|---------|----------|
| `PaymentSession` | تتبع جلسة دفع واحدة (PENDING → SUCCEEDED/FAILED/EXPIRED). لا تمس الـ Ledger حتى تأكيد الـ Webhook. |
| `GatewayWebhook` | دفتر Idempotency للـ Webhooks (`@@unique([provider, hotelId, eventId])`). |

**مسارات API الجديدة:**

| الطريقة | المسار | الوصف |
|--------|--------|-------|
| POST | `/api/public/bookings/[id]/payment-session` | بدء جلسة دفع لحجز عام (يتطلب `gateway: "plutu"|"tlync"` و `returnUrl`). يعيد `paymentUrl` للتوجيه. محمي بـ Rate Limit (5 req/min/booking+IP). يعتمد على **بيانات الاعتماد المخزّنة** في `IntegrationConfig` عبر `resolveGatewayConfig` (DB-first بلا Cache؛ صفٌّ قائم معطَّل/ناقص → 400 `GATEWAY_CONFIG_UNAVAILABLE`؛ `.env` ملاذ أخير فقط عند غياب صف). |
| POST | `/api/external/gateways/[provider]/webhook` | استقبال إشعار الدفع من Plutu/T-Lync. يتحقق من التوقيت (timingSafeEqual)، Zod validation، Idempotency. عند SUCCESS: ينشئ `Payment` SUCCEEDED، يطبق على `Folio` (Atomic transaction)، يحدّث `PaymentSession` → SUCCEEDED. **التحقق من التوقيع يقرأ مفتاح `PaymentSession.gatewayConfig` (لقطة مشفّرة لحظة الإنشاء)** — تدوير المفتاح في منتصف الجلسة لا يكسر دفعاً عابراً. |

**مصنع البوابات (Factory Pattern):**
```typescript
import { getGatewayAdapter } from '@/lib/integrations/gateways';
const adapter = getGatewayAdapter('plutu'); // أو 'tlync'
await adapter.createPaymentSession({ amount, currency, orderId, ... });
```

**مجالات الاستخدام الحالية:**
- Plutu: `createPlutuPaymentSession` + `verifyPlutuSignature` (SHA-256)
- T-Lync: `createTLyncPaymentSession` + `verifyTLyncSignature` (HMAC-SHA256)

> **ملاحظة هندسية:** التوقيعات الحالية Placeholders — ستُحدّث عند ورود وثائق Sandbox الرسمية. الـ Factory يسمح بإضافة بوابات جديدة دون تعديل مسارات الـ Webhook.

### 🔐 طبقات الأمان

1. **النقل**: HTTPS + Helmet.js
2. **المصادقة**: JWT + Refresh Token Rotation — **لا يوجد تسجيل ذاتي**: الحسابات تُنشأ فقط عبر دعوات (Invitation) من الـ Super-Admin
3. **الصلاحيات**: RBAC (Super Admin, Admin, Manager, Reception, Housekeeping, Maintenance, Restaurant, Accountant)
4. **الحماية**: CSRF Token + Rate Limiting + Zod Validation
5. **المراقبة**: Audit Log (تتبع كل عملية)
6. **الشركاء**: API Key + HMAC + IP Whitelist
7. **الجلسات**: Session Management + Self-Healing Auth
8. **عزل المستأجرين في قاعدة البيانات (M8 — RLS):** Row-Level Security مفروض (FORCE) على 59 جدولاً — 54 مستأجَراً بسياسة `tenant_isolation` مباشرة (`app_hotel_id() = hotelId` عبر GUC جلسة) + 5 عامة (`allow_all`) + **19 تطويق اشتقاق `hotelId`** من الأبوين بنمط قفل حتمي (`FOR NO KEY UPDATE … SKIP LOCKED`) — المرجع `docs/M8-RLS-ARCH.md`، والأداة `scripts/apply-rls.ts` (خراج `prisma/rls/rls.sql`)

### 🌐 نطاقات مخصصة (White-Label SaaS)

- **`customDomain` لكل فندق** (`@unique` في `Hotel`): يُدار عبر إنشاء الفندق أو `PATCH /api/superadmin/hotels/[id]`
- **تحديد الفندق عبر Hostname** — `src/lib/utils/tenant.ts`:
  - `normalizeDomain`: توحيد النطاق (أحرف صغيرة، بلا scheme/port/path)
  - `getEffectiveHost`: يُثق بـ `x-forwarded-host` **فقط** عند مرور الطلب عبر Cloudflare (وجود رأس `cf-ray`)، أو عند تفعيل `TRUST_PROXY=true` صراحةً — وإلا يُستخدم `host`/URL فقط (لا يمكن تزييف رأس مُمرَّر من طلب مباشر)
  - `resolveTenantFromRequest`: استعلام Prisma `@unique` — يعمل في بيئة Node فقط (المسارات)
- **البيانات محمية بـ JWT لا بالـ hostname**: النطاق ليس سلطةً أمنية — هو أداة تقييد/تخصيص فقط. الوصول لأي بيانات يمرّ حصراً عبر `hotelId` داخل التوكن (العزل مفروض في كل استعلام). طبقات اختيارية: `ENFORCE_TENANT_DOMAIN=true`
- **قفل دخول صارم**: على `customDomain` خاص بفندق، يعمل الدخول فقط لمستخدمي ذلك الفندق (`login(email, password, hotelId?)`) مع رسالة موحّدة — لا كشف عن وجود الحساب
- **روابط الدعوات ثابتة**: تُبنى دائماً على نطاق المنصة الأساسي (`NEXT_PUBLIC_APP_URL`، مع البديل `request.nextUrl.origin`) وليس على `customDomain` الجديد — لتعمل فوراً حتى أثناء انتشار DNS/Cloudflare. يُحمَل النطاق كمعامل إرشادي `?domain=` فقط
- **الكوكيز host-only (بلا `Domain`)**: كوكيز الدخول لا تحمل خاصية `Domain` فيكون عزلها تلقائياً حسب النطاق — أي جلسة على `daralsalam.ly` لا تُشارك مع نطاق المنصة. لا تغيير في كود الكوكيز؛ حارس اختبار يضمن غياب `Domain` في `Set-Cookie`

### 👑 لوحة التحكم العليا (Super-Admin Dashboard)

- **توجيه محمي صرامةً**: مجموعة مسارات `(dashboard)/superadmin/` محمية على مستويين — Edge Middleware (يتطلب `SUPER_ADMIN` وإلا إعادة توجيه لـ `/access-denied`) + حارس Layout من جهة العميل
- **`/superadmin/hotels`**: جدول الفنادق (الاسم، الدومين المخصص، عدد المستخدمين، الدعوات المعلقة، تاريخ الإنشاء) + نافذة "إنشاء فندق" تعرض رابط الدعوة مع زر نسخ فوري + نافذة "تعديل النطاق" (`PATCH /api/superadmin/hotels/[id]`)
- **`/superadmin/invitations`**: كل الدعوات (معلقة/منتهية/مستخدمة) مع بطاقات ملخص + زر "إعادة إرسال" يجدّد التوكن والصلاحية ويعرض الرابط الجديد (إلغاء الرابط القديم فوراً)
- **بنية 1:1 صارمة**: لا تعددية مستخدمين عبر فنادق ولا تجاوز للدومين — كل فندق مستأجر مستقل
- **🛡️ تحوّل Gated-Control-Room (v9):** المنطقة ستُنقَل إلى مجموعة توجيه معزولة `app/(superadmin)/` وتصبح محميةً بـ **2FA إلزامية عبر Email OTP** — كلمة المرور وحدها لا تصدر جلسة صالحة في هذه المنطقة؛ جلسة `accessToken` تُصدر فقط بعد طبقتين (باسورد + OTP) وتحمل ادعاء `tv` يفحصه الـ Middleware. **المرجع:** `docs/SUPER-ADMIN-ARCH.md`. **منجز الآن (Backend):** `SA.1` (وثيقة + Schema) و`SA.2` (كود الخادم للمصادقة الثنائية — OTP Service + `/api/superadmin/auth/{login,verify-otp}` + شرط `tv` على الحافة + `withPlatformAuth`) مع اختبار تكاملي 30/30، و`SA.2.5` (**إعادة إرسال OTP — `POST /api/superadmin/auth/resend-otp`**: هوية من كوكي `sa_otp` لا من الجسم، تهدئة `SUPERADMIN_OTP_RESEND_COOLDOWN_SECONDS` أرضية DB + سقف موزّع 3/5د، تمديد الصلاحية وإبطال الكود القديم معاً، تدقيق كامل)، و`SA.4` (الـAPI لمنطقة التكاملات — `GET/POST/DELETE /api/superadmin/integrations` + Provider Registry + `IntegrationKind`/`updatedById` على `IntegrationConfig`) مع اختبار تكاملي 26/26، و`SA.4.5` (**ربط المفاتيح بالتشغيل** — `resolveGatewayConfig` DB-first بلا Cache في `payment-session`، والـ webhook على لقطة `gatewayConfig`؛ اختبار `gateway-wiring` 10/10). **بقي:** الواجهة والعزل (SA.3..SA.6).

---

## 🗺️ خريطة التنفيذ

### المرحلة 1 — MVP ✅
- [x] هيكل المشروع + Docker + Prisma
- [x] المصادقة والأمان (JWT + RBAC + CSRF)
- [x] إدارة الغرف والحجوزات الأساسية
- [x] نظام الفوترة (Folio Billing)
- [x] الدفع: Stripe + موبي كاش + نقدي
- [x] Middleware منفصل (Auth, Rate Limit, CSRF, Validate)
- [x] اختبارات وحدة + تكامل
- [x] نشر على GitHub

### المرحلة 2 — تعزيز ✅
- [x] واجهة الاستقبال (Check-in/Check-out)
- [x] نظام المحفظة (Wallet + Credit Extension)
- [x] إدارة النزلاء (Guests)
- [x] التدبير المنزلي (Housekeeping)
- [x] المفقودات (Lost & Found)
- [x] صندوق الأمانات (Safe Deposit)
- [x] نقاط البيع (POS / Restaurant)
- [x] التقارير الأساسية
- [x] فواتير PDF + إيصالات PDF

### المرحلة 3 — تحسينات الجودة (QA Round 1) ✅
- [x] إخفاء زر الدفع للفواتير المسددة
- [x] منع دفع الفواتير ذات الرصيد <= 0
- [x] إزالة OCCUPIED من confirm() — فقط checkIn() يغيّر حالة الغرفة
- [x] نظام ترحيل الديون (Wallet migrateDebt)
- [x] حقل allowCredit في Guest
- [x] مزامنة Folio (SETTLED → ACTIVE عند إضافة رسوم جديدة)
- [x] منع السباق في إنشاء الحجوزات ($transaction)
- [x] PATCH لتعديل الحجز
- [x] منع تسجيل الوصول المبكر
- [x] لوحة التنبيهات (Overdue alerts) مع رقم الغرفة ورقم الهاتف
- [x] تواريخ الوصول/المغادرة على بطاقة الحجز
- [x] تصحيح ترحيل hybrid_safe_deposit_box
- [x] TypeScript 0 أخطاء

### المرحلة 4 — الكمال التشغيلي (Core Operational Perfection) ✅
- [x] **نقل الغرفة (Room Move):** تحويل الفوترة + تغيير حالة الغرف + إنشاء مهمة تدبير
- [x] **تمديد الإقامة (Stay Extension):** إعادة حساب الرسوم + التحقق من التوفر عبر كل الغرف + Folio delta
- [x] **سياسات الإلغاء مع عقوبات:** نظام هرمي (RatePlan → حجز → افتراضي) + استرداد متدرج + إلغاء مع استرداد + Waiver
- [x] **حجوزات المجموعات (Group Bookings):** Master Folio + Sub-Folios + Routing Rules (ROOM_CHARGE, SERVICE, TAX, DISCOUNT, RESTAURANT, SAFE_DEPOSIT)
- [x] **Tape Chart:** تقويم تفاعلي بالسحب والإفلات — نقل غرفة، تمديد إقامة، ترميز لوني، تجميع طوابق

### المرحلة 5 — التشغيل المتقدم (Operations Pro) 📅
- [ ] تحسينات Tape Chart: تصفية، بحث، طباعة
- [ ] تقارير المجموعات: تقارير موحّدة لكل Group Booking
- [ ] أتمتة الفوترة الشهرية للشركات (Corporate Billing)
- [ ] لوحة القيادة (Dashboard) متقدمة مع مؤشرات الأداء
- [ ] نظام التنبيهات والإشعارات المتقدمة
- [ ] دعم محركات حجز إضافية في التكامل الخارجي (normalizers جديدة)

### المرحلة 6 — التكامل الخارجي (External Integration) 🔄
- [x] **v8 Decoupled PMS Ledger:** حقن الحجوزات الخارجية عبر `POST /api/integrations/[engine]/bookings` بمفاتيح لكل فندق + دفتر Idempotency + صفحة `/admin/integrations` (إزالة البوابات الخارجة نهائياً)
- [x] **Channel Manager API (Sprint 2):** نماذج `ChannelProvider`/`ChannelMapping`/`ChannelPriceSnapshot`، بناء اللقطات (Availability Snapshots)، المعاينة/النشر غير المتزامن، Webhook الوارد `external/channel/[provider]/bookings`، لوحة Bull Board للمراقبة
- [ ] تكامل محاسبي (Integration with accounting systems)
- [ ] PMS API للربط مع الأنظمة العالمية
- [ ] نظام الحجوزات الجماعية (Wholesale / Travel Agents)
- [ ] تطبيق موبايل (React Native)

### المرحلة 9 — المهام غير المتزامنة (Async Job Processing) 🔄
- [x] **Phase 0 — BullMQ Foundation:** Redis + 5 طوابير `cm-*` + عامل واحد + JobScheduler (02:00/03:00) + healthcheck
- [x] **Phase 1 — Bull Board + Async Publish:** `/admin/queues` مراقب، publish يرسل jobs ويعيد 202
- [x] **Phase 2 — Real Job Processors:** buildSnapshot, pushToOTA (w/ Retry-After), processInboundBooking, pushRatePlan, reconcileInventory

### المرحلة 10 — VCC & PCI-DSS Compliance (Virtual Credit Card) ✅
- [x] **W1 — Schema & Normalizer:** Prisma schema مع حقول VCC/VGS، VCCAuditLog، WebhookNormalizer (Factory pattern) لـ Booking.com/Expedia/others
- [x] **W2 — VGS Proxy Integration:** مسارات `/api/external/channel/vgs/[provider]/bookings` + `vgs-simulator`، تخزين tokens على Payment، و`vgs-client.ts` لحذف tokens من Vault
- [x] **W3 — Secure Reveal UI:** `VCCReveal.tsx` (iframe بعرض 60 ثانية) + `GET /api/admin/bookings/[id]/vcc-tokens` مع تسجيل `revealed` في VCCAuditLog
- [x] **W4 — Purge & Compliance:** Job يومي `daily-vcc-purge-scan` (03:00 Africa/Tripoli) يعمل تحت PLATFORM context ويوزّع مهام `purge-vcc` بسياق TENANT صارم + Checklist SAQ A في docs

### المرحلة 7 — الذكاء والإحصائيات (Analytics & AI) 📅
- [ ] لوحة تحليلات متقدمة (Power BI / Metabase)
- [ ] تنبؤ بالإشغال (Occupancy Forecasting)
- [ ] تسعير ديناميكي (Dynamic Pricing Engine)
- [ ] تقارير ذكية مع توصيات

### المرحلة 8 — منصة الـ SaaS (White-Label Platform) ✅
- [x] **v3.5 White-Label SaaS:** customDomain لكل فندق + قفل دخول صارم + سياق العلامة + روابط دعوات على نطاق المنصة + كوكيز host-only
- [x] **v3.6 لوحة التحكم العليا:** فنادق + دعوات + إعادة إرسال الدعوات + حماية مزدوجة
- [x] **صفحات الحجز العامة (Public Booking):** `/book` (تواريخ → غرف → بيانات ضيف) + `/booking-confirmed` (رقم الحجز + ملخص + إرشادات الدفع) فوق `GET /api/public/availability` و `POST /api/public/bookings`
- [x] **لوحة تحكم الموقع + حجز بنوع الغرفة (Phase 3 — مكتملة ✅):** `WebsiteSetting` (تفعيل/ضريبة/رسوم/خصم/مهلة تأكيد) + `BookingRoom.roomId` أصبح nullable مع `roomTypeId` (حجز ويب بلا غرفة فيزيائية حتى تأكيد الاستقبال) + `RoomType` حقل `isWebVisible`/`webRoomLimit`/`webPrice` + `Booking` لقطة مالية ويب (`webTaxAmount`/`webFeesAmount`/`webDiscountAmount`/`webTotalAmount`) — **M0/M1/M2/M3/M4 مكتملون ✅**
- [ ] **🛡️ Super Admin Control Room & 2FA (v9 — SA.1+SA.2+SA.2.5+SA.4+SA.4.5 Backend منجز):** تحويل منطقة السوبر أدمن إلى مجموعة معزولة `app/(superadmin)` محمية بـ **Email OTP 2FA إلزامية** + فصل الرموز (رمز تحدٍّ محدود النطاق ↔ جلسة تحمل `tv`) + تخزين OTP **مُهشَّراً** (HMAC بمفتاح `SUPERADMIN_OTP_SECRET`) + جدولا `OtpChallenge`/`PlatformAuditLog` + `api/superadmin/integrations` (مفاتيح بوابات الدفع/OTAs تُدار بالنيابة عن الفنادق، حصرياً لمالك النظام). **منجز:** SA.1 (وثيقة + مخطّط) وSA.2 (كود الخادم) — الـ OTP يعمل فعلياً على `/api/superadmin/auth/{login,verify-otp}` بشرط `tv` على الحافة، ويتأكد منه `npm run test:superadmin-otp` (30/30، ضمنها **إعادة الإرسال**) — و**SA.4** (تكاملات `GET/POST/DELETE /api/superadmin/integrations` + Provider Registry + `IntegrationKind`/`updatedById`) ويتأكد منه `npm run test:superadmin-integrations` (26/26) — و**SA.4.5** (ربط المفاتيح بالتشغيل: `resolveGatewayConfig` DB-first بلا Cache + بقاء الـ webhook على لقطة `gatewayConfig`؛ `npm test` يشمل `tests/integration/gateway-wiring.test.ts` 10/10)، والاختبارات الشاملة 284/284. **المرجع:** `docs/SUPER-ADMIN-ARCH.md`. **بقي:** SA.3..SA.6 (الواجهة والعزل).

---

## 📊 API Endpoints

### المصادقة (Auth)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| POST | /api/auth/login | تسجيل الدخول (يُقفل على الفندق تلقائياً عند الوصول عبر customDomain) |
| GET | /api/auth/context | سياق العلامة قبل الدخول: يُرجع `{ hotelId?, hotelName? }` فقط حسب hostname (معدّل بمعدّل الطلبات) |
| GET | /api/auth/invitations/[token] | التحقق من صحة دعوة انضمام |
| POST | /api/auth/register | تفعيل الحساب عبر دعوة (يتطلب token صالح — لا يوجد تسجيل ذاتي) |
| POST | /api/auth/refresh | تحديث التوكن |
| GET | /api/auth/csrf | الحصول على CSRF token |

### منصة الـ SaaS (Super-Admin)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/superadmin/hotels | قائمة كل الفنادق مع الدومين المخصص وتاريخ الإنشاء وعدّادات المستخدمين/الدعوات المعلقة (SUPER_ADMIN فقط) |
| POST | /api/superadmin/hotels | إنشاء فندق جديد + دعوة مدير الفندق (SUPER_ADMIN فقط) — يقبل `customDomain` اختيارياً، ورابط الدعوة يُبنى دائماً على نطاق المنصة الأساسي |
| PATCH | /api/superadmin/hotels/[id] | تحديث/مسح `customDomain` للفندق (SUPER_ADMIN + CSRF فقط) |
| GET | /api/superadmin/invitations | قائمة كل الدعوات مع الحالة المحسوبة (معلقة/منتهية/مستخدمة) + الفندق + من أنشأها (SUPER_ADMIN فقط) |
| POST | /api/superadmin/invitations/[id]/resend | إعادة إرسال دعوة معلقة: جدّد التوكن والصلاحية (7 أيام) وأبطل الرابط القديم، وأعِد الرابط الجديد على نطاق المنصة (SUPER_ADMIN + CSRF + Rate Limit) |
| POST | /api/superadmin/auth/login | 🟢 **SA.2 مُنجَز** — الطبقة الأولى: تحقق الباسورد لسوبر أدمن، يرفض الحسابات بلا 2FA (403)، يُصدر رمز تحدٍّ `sa_otp` ويرسل OTP ولا يصدر جلسة | 
| POST | /api/superadmin/auth/verify-otp | 🟢 **SA.2 مُنجَز** — الطبقة الثانية: يُتحقق من الكود (HMAC + timing-safe) مع حد محاولات + إغلاق حساب عند النفاد، ثم يصدر `accessToken` يحمل `tv=true` |
| POST | /api/superadmin/auth/resend-otp | 🟢 **SA.2.5 مُنجَز** — إعادة إرسال OTP: هوية من كوكي `sa_otp` (لا إيميل من الجسم — لا Spam/Enumeration)، تهدئة `SUPERADMIN_OTP_RESEND_COOLDOWN_SECONDS` (60ث) أرضية DB + سقف موزّع 3/5د (fail-open) + CSRF، إبطال الكود القديم + تصفير المحاولات + تمديد الصلاحية في نفس الصف، و`Retry-After` في الرد (+ تدقيق `PlatformAuditLog`) |
| GET | /api/superadmin/integrations?hotelId= | 🟢 **SA.4 مُنجَز** — سرد تكاملات فندق (`hasKey` فقط، لا أسرار — Zero-Leakage، مع فلترة `kind` اختيارية) |
| POST | /api/superadmin/integrations | 🟢 **SA.4 مُنجَز** — حفظ مفاتيح بوابة/OTA لفندق معيّن مشفّرة AES-256-GCM (حصرية SUPER_ADMIN + `tv` + CSRF) — البوابات: حزمة `{merchantId,secretKey}` · محركات الحجز: نصّ خام متوافق خلفياً |
| DELETE | /api/superadmin/integrations?hotelId=&engine= | 🟢 **SA.4 مُنجَز** — حذف دائم لربط التكامل + إبطال المفاتيح + سجل تدقيق |

### الحجوزات (Bookings)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/bookings | قائمة الحجوزات |
| POST | /api/admin/bookings | إنشاء حجز جديد |
| GET | /api/admin/bookings/[id] | تفاصيل الحجز |
| PATCH | /api/admin/bookings/[id] | تعديل الحجز |
| POST | /api/admin/bookings/[id]/checkin | تسجيل وصول |
| POST | /api/admin/bookings/[id]/checkout | تسجيل مغادرة (مع ترحيل ديون) |
| POST | /api/admin/bookings/[id]/cancel | إلغاء الحجز (مع استرداد / quote) |
| POST | /api/admin/bookings/[id]/charge-service | إضافة خدمة |
| POST | /api/admin/bookings/[id]/extend | تمديد الإقامة |
| POST | /api/admin/bookings/[id]/move-room | نقل الغرفة |
| POST | /api/admin/bookings/[id]/assign-room | تخصيص غرفة فيزيائية لغرفة حجز ويب (`bookingRoomId` + `roomId`) — يقفل صف الغرفة، يرفض التعارض 409، ويحوّل PENDING → CONFIRMED عند اكتمال التخصيص |
| GET | /api/public/availability | فحص توفر الغرف (checkIn/checkOut/adults/children/roomTypeId?) — يعيد الغرف المتاحة + السعر + سياسة الإلغاء + السعة (مرشّح حسب عدد البالغين/الأطفال) |
| GET | /api/public/bookings | استعلام ضيف عن الحجز بالرقم + البريد/الهاتف (تحقق + عرض ملخص الإقامة) |
| POST | /api/public/bookings | إنشاء حجز عام (roomId/checkIn/checkOut/adults/children + بيانات الضيف) — حالة PENDING، الدفع عند الوصول |

### حجوزات المجموعات (Group Bookings)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/group-bookings | قائمة المجموعات |
| POST | /api/admin/group-bookings | إنشاء مجموعة جديدة |
| GET | /api/admin/group-bookings/[id] | تفاصيل المجموعة |
| POST | /api/admin/group-bookings/[id]/assign | إضافة حجوزات للمجموعة |
| POST | /api/admin/group-bookings/[id]/routing | ضبط قواعد التوجيه |

### سياسات الإلغاء (Cancellation Policies)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/cancellation-policies | قائمة السياسات |
| POST | /api/admin/cancellation-policies | إنشاء سياسة |
| GET | /api/admin/cancellation-policies/[id] | تفاصيل سياسة |

### Tape Chart
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/tape-chart | بيانات الإشغال (نطاق تاريخ) |

### الغرف (Rooms)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/rooms | قائمة الغرف |
| POST | /api/admin/rooms | إنشاء غرفة |
| PATCH | /api/admin/rooms/[id]/status | تغيير حالة غرفة |
| GET | /api/public/room-types | أنواع الغرف (عام) |

### الفوترة (Folio)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/folio/[id] | تفاصيل الفاتورة |
| POST | /api/folio/[id]/charge | إضافة رسوم |
| POST | /api/folio/[id]/discount | إضافة خصم |
| GET | /api/folio/[id]/invoice-pdf | تصدير PDF |
| POST | /api/folio/[id]/transactions/[txId]/void | إلغاء معاملة |

### المدفوعات (Payments)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| POST | /api/payments/create | تسجيل دفع (يدوي من الاستقبال أو حقن خارجي) — بلا بوابة خارجة |
| GET | /api/admin/payments | قائمة المدفوعات |
| POST | /api/admin/payments/[id]/refund | استرداد مبلغ |

### التكامل الخارجي (External Booking & Ledger Injection) — v8
> **الأمان:** مفاتيح التكامل لكل فندق تُخزَّن **مشفّرة** (AES-256-GCM بمفتاح المنصة `PAYMENT_CRYPTO_KEY`) في `IntegrationConfig` وتُعاد فقط `hasKey` — النص الصريح يُعرض مرة واحدة عند التوليد. دقة المستأجر تأتي من صف الـ DB الذي ينتمي إليه المفتاح (لا من البايلود)، والغرف غير المملوكة → 400، والإعدادات غير المملوكة → 404. كل حقن في معاملة واحدة مع دفتر Idempotency `GatewayWebhook` (`@@unique([provider, hotelId, eventId])`).

> ⚠️ **تنبيه — قبل الإطلاق (TECH LEAD):** normalizers الخاصة بـ `booking.com` و `expedia` في `src/lib/integrations/normalizers.ts` حالياً **بدائل تقريبية (best-effort placeholders)** — مبنية على بنية حمولات شائعة وليست معتمدة من المصادر الرسمية. يجب على Tech Lead تحديثها بعينات JSON حقيقية (samples) من محرّكي الحجز قبل الإطلاق الفعلي، مع إضافة اختبارات تطبيع لكل محرك. المحرك `custom` جاهز وموثّق.

| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/integrations | قائمة إعدادات المحركات (مقنّعة — `hasKey`) |
| POST | /api/admin/integrations | إنشاء/تحديث إعداد محرك (upsert) |
| GET | /api/admin/integrations/[engine] | تفاصيل محرك واحد |
| PATCH | /api/admin/integrations/[engine] | تحديث محرك (تفعيل/تعطيل) |
| POST | /api/admin/integrations/[engine]/key | توليد مفتاح API جديد (يُعرض مرة واحدة) |
| POST | /api/integrations/[engine]/bookings | حقن حجز خارجي مؤكد + دفع + تسوية (بمفتاح `x-api-key`، بلا CSRF/rate-limit — دفتر Idempotency) |

### 🔮 العمارة المستقبلية: Channel Manager & Room Mapping
عند تفعيل إرسال التوفر (Availability Push) والتسعير إلى OTAs، سيتطلب التكامل **جدول ربط (Mapping Table)** في قاعدة البيانات يصل رموز أنواع الغرف الخارجية بمعرّفات غرفنا الداخلية:

```
OtaRoomMapping
├── hotelId        UUID        ← نطاق المستأجر (إلزامي)
├── ota            String      ← المحرك (booking.com, expedia, ...)
├── otaRoomCode    String      ← الرمز الخارجي (مثال: 'DBL-ROOM', 'SUP-STD')
├── roomId         UUID        ← roomId الداخلي (FK → Room)
└── @@unique([hotelId, ota, otaRoomCode])
```

- كل خريطة تخضع لنطاق `hotelId` الصارم (القاعدة §14) — نفس الرمز الخارجي `DBL-ROOM` يمكن أن يرتبط بغرفة مختلفة لكل فندق.
- الحقول الفريدة المركّبة تمنع تعارض التعيينات داخل نفس المستأجر/المحرك.
- ستُدار الخرائط عبر مسار إدارة (Admin) وسيُتحقق منها داخل الـ normalizers قبل الحِقن — استبدال التطابق بالاسم أو التخمين.
- سيكون هذا أساس الـ **Channel Manager API** (المرحلة 6 في خريطة التنفيذ) لتوزيع الغرف/الأسعار على OTAs.

### النزلاء (Guests)
> **أمان متعدد الفنادق:** النزلاء (Guests) نطاقهم `hotelId` — كل بحث/تعديل يتحقق من الفندق، والحقول الفريدة (البريد، الهاتف، الرقم الوطني) فريدة داخل الفندق فقط. أي وصول لمعرّف نزيل من فندق آخر يعيد 404.

| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/guests | قائمة النزلاء |
| POST | /api/admin/guests | إنشاء نزيل |
| GET | /api/admin/guests/[id] | تفاصيل نزيل |
| PATCH | /api/admin/guests/[id] | تحديث نزيل |
| GET | /api/admin/guests/[id]/folio | فواتير النزيل |
| GET | /api/admin/guests/[id]/wallet | محفظة النزيل |
| GET | /api/admin/guests/search | بحث عن نزيل |
| GET | /api/admin/guests/[id]/documents | قائمة وثائق النزيل (محمية) |
| POST | /api/admin/guests/[id]/documents | رفع وثيقة (JPG/PNG/PDF، حد 5MB) |
| GET | /api/admin/documents/[documentId]/download | تنزيل وثيقة من التخزين الخاص |

### المحفظة (Wallet)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/wallet | قائمة المحافظ |
| GET | /api/admin/wallet/[id] | تفاصيل محفظة |
| POST | /api/admin/wallet/[id]/freeze | تجميد/إلغاء تجميد |
| GET | /api/admin/wallet/transactions | حركات المحافظ |
| GET | /api/admin/wallet/transactions/[id]/receipt | إيصال PDF |

### التقارير (Reports)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/reports | لوحة التقارير |
| GET | /api/admin/reports/occupancy | تقرير الإشغال |
| GET | /api/admin/reports/revenue | تقرير الإيرادات |
| GET | /api/admin/reports/housekeeping | تقرير التدبير المنزلي |
| GET | /api/admin/reports/restaurant | تقرير المطعم |
| GET | /api/admin/reports/wallet | تقرير المحفظة |
| GET | /api/admin/reports/safe-deposit | تقرير صندوق الأمانات |
| GET | /api/admin/reports/export | تصدير التقرير |
| POST | /api/admin/reports/share | مشاركة التقرير |
| PATCH | /api/admin/reports/settings | إعدادات التقارير |

### التدبير المنزلي (Housekeeping)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/housekeeping | قائمة المهام |
| POST | /api/admin/housekeeping | إنشاء مهمة |
| PATCH | /api/admin/housekeeping/[id] | تحديث مهمة |

### المفقودات (Lost & Found)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/lost-found | قائمة العناصر |
| POST | /api/admin/lost-found | إضافة عنصر |
| PATCH | /api/admin/lost-found/[id] | تحديث عنصر |

### صندوق الأمانات (Safe Deposit)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/safe-deposit | قائمة الصناديق |
| POST | /api/admin/safe-deposit | إنشاء صندوق |
| PATCH | /api/admin/safe-deposit/[id] | تحديث صندوق |
| POST | /api/admin/safe-deposit/[id]/items | إضافة عنصر |

### نقاط البيع (POS / Restaurant)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/menu-categories | فئات القائمة |
| POST | /api/admin/menu-categories | إنشاء فئة |
| GET | /api/admin/menu-items | عناصر القائمة |
| POST | /api/admin/menu-items | إنشاء عنصر |
| GET | /api/admin/restaurant-orders | قائمة الطلبات |
| POST | /api/admin/restaurant-orders | إنشاء طلب |
| POST | /api/admin/restaurant-orders/[id]/settle | تحصيل الطلب |

### الخزن (SafeBoxes)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/safeboxes | قائمة الخزن |
| POST | /api/admin/safeboxes | إنشاء خزنة |

### إعدادات الإدارة (Admin Settings)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/settings | الإعدادات |
| PATCH | /api/admin/settings | تحديث الإعدادات |
| GET | /api/admin/settings/safebox-packages | باقات الخزن |
| GET/POST | /api/admin/users | إدارة المستخدمين |
| PATCH | /api/admin/users/[id] | تحديث مستخدم |
| GET/POST | /api/admin/room-types | أنواع الغرف |
| PATCH | /api/admin/room-types/[id] | تحديث نوع غرفة |
| GET/POST | /api/admin/services | الخدمات |
| GET/POST | /api/admin/service-categories | فئات الخدمات |
| GET/POST | /api/admin/task-types | أنواع المهام |
| GET/POST | /api/admin/rate-plans | خطط الأسعار |
| GET | /api/admin/audit-logs | سجل التدقيق |
| GET | /api/admin/external-clients | العملاء الخارجيون |
| POST | /api/admin/reconcile | تسوية يدوية |

### Webhooks
> أُزيل في v8 — لا توجد Webhooks خارجة بعد الآن. حقن المحركات يتم عبر `POST /api/integrations/[engine]/bookings` (انظر التكامل الخارجي).

---

## 🧪 الاختبارات

```bash
# اختبارات الوحدة + التكامل (21 ملف — 208 اختبار ✅)
npm test

# التحقق من الأنواع
npm run typecheck

# فحص الكود
npm run lint
```

### هيكل الاختبارات
```
tests/
├── unit/
│   ├── booking-number.test.ts
│   ├── calendar-utils.test.ts
│   ├── errors.test.ts
│   ├── normalizers.test.ts
│   ├── password.test.ts
│   ├── public-booking.test.ts
│   └── shared-schemas.test.ts
├── integration/
│   ├── auth.service.test.ts
│   ├── booking.service.test.ts
│   ├── folio.service.test.ts
│   ├── checkout-finance.test.ts
│   ├── early-checkout.test.ts
│   ├── group-routing.test.ts
│   ├── e2e-wallet-pos-folio.test.ts
│   ├── external-bookings.test.ts
│   ├── guest-documents.test.ts
│   ├── guest-documents.routes.test.ts
│   ├── multi-tenancy-isolation.test.ts
│   ├── onboarding.test.ts
│   ├── superadmin-dashboard.test.ts
│   └── tenant-domain.test.ts
├── helpers/
│   └── db.ts
└── setup.ts
```

---

## 📜 سجل التغييرات (Changelog)

| التاريخ | الإصدار | أبرز التغييرات |
|---------|---------|----------------|
| 2026-10-22 | v9.2 | **M3/M4 — قفل الحصة الذرّي + تخصيص الغرفة الفيزيائية + الانتهاء التلقائي للحجوزات غير المؤكدة:** **M3:** انتقل فحص حصة الويب إلى **داخل** `tenantTx` في `BookingService.create` مع قفل صف `RoomType` (`SELECT … FOR UPDATE`) ثم إعادة عدّ PENDING والغرف الفيزيائية — سباق الطلبين المتزامنين صار محكوماً (واحد ينجح والآخر `409 ConflictError` جديد في `errors.ts`). **M4-A:** `assignPhysicalRoom` (قفل `Room` + تحقق ملكية/نوع/حالة/تعارض تواريخ + تدقيق `ASSIGN_ROOM` + تحويل `PENDING → CONFIRMED` عند اكتمال كل الصفوف)، وحارس `checkIn` الصارم (رفض أي حجز ما زال بلا غرفة فيزيائية قبل أي طفرة)، ومسار `POST /api/admin/bookings/[id]/assign-room` (Zod + CSRF + rate-limit + أدوار ADMIN/MANAGER/RECEPTION)، ومكوّن `AssignRoomModal` + شارة «بانتظار تخصيص غرفة» وتعطيل زر الدخول في صفحة الاستقبال. **M4-B:** خدمة `web-booking-expiry.service.ts` (`runWebBookingExpiryScan`: PLATFORM للجرد ثم TENANT لكل فندق — إلغاء PENDING WEBSITE الأقدم من `confirmationCutoffHours` بلا دفعة SUCCEEDED + VOID للفاتورة النشطة بصفر مدفوع + تدقيق `AUTO_EXPIRE_WEB_BOOKING`) مجدولة ساعياً `hourly-web-booking-expiry` على طابور reconcile مع dispatch في `reconcileInventoryProcessor`. **اختبارات:** `public-booking-m3-m4.test.ts` 5/5 (سباق حصة متزامن، حجب الحجز عند نفاد الغرف، حارس الدخول ثم التخصيص ثم الدخول، رفض تخصيص غرفة محجوزة، انتهاء 25 ساعة مقابل حجز حديث) → الإجمالي **31 ملفاً / 293 اختباراً أخضر** + `tsc`/`lint` نظيف. **تنظيف:** حُذف مسار العمل القديم `C:\Users\Weeshi\hotel-management` (نسخة مطابقة) وحُذفت تقارير التدقيق المتتبَّعة وأُضيفت لـ`.gitignore`. |
| 2026-10-21 | v9.1 | **M10 — امتثال VCC & PCI-DSS (Virtual Credit Card) + تحصين الأنواع والبروكسي لـ M8/M10:** **تحصين طبقة المستأجرين:** أُصلح `withHotelInjection` و`relay()` في `src/lib/utils/prisma.ts` (تجاهل خصائص Prisma الداخلية `_tracingHelper`، ربط الدوال المفقودة `bind`، تمرير الوسيط الثاني `callback`، وحقن `hotelId` في كل عمليات `relay` تحت سياق TENANT) مع إضافة `hotelId` صريحاً في كل مواقع الإنشاء الـ19 للنماذج المستأجَرة (`tsc --noEmit` → **0 أخطاء**). **اكتملت M10 (W1–W4):** `vgs-client.ts` (حذف tokens من Vault مع timeout و404 idempotent)، `VCCReveal.tsx` (iframe بعرض مؤقت 60 ثانية + `GET /api/admin/bookings/[id]/vcc-tokens` مع تسجيل `revealed` في VCCAuditLog وصلاحيات ADMIN/MANAGER/RECEPTION)، و`purgeVCC.job.ts` (`daily-vcc-purge-scan` الساعة **03:00 Africa/Tripoli** تحت سياق PLATFORM يوزّع مهام `purge-vcc` بسياق TENANT صارم تحمل `hotelId`، بعد `checkOut + 7 أيام`، مع 10 محاولات/backoff أسّي). **تنظيف الأنواع:** تضييق TypeScript صارم عبر `vcc-normalizer.ts` (صفر `any` — دوال `asRecord`/`asString`/`asNumber`/`pickString`) وإزالة `any` من `vgs-client.ts` و`purgeVCC.job.ts` و`VCCReveal.tsx`. **توثيق:** تحديث `docs/PRODUCTION-DEPLOYMENT.md` (توقيت الحذف 03:00 + متغيّر `VGS_MANAGEMENT_API_KEY`). **الاختبارات:** توسيع `vcc-purge-flow.test.ts` بتغطية موجّه المهام (daily scan → PLATFORM، و`purge-vcc` → حذف كامل + audit) ليصل الإجمالي إلى **30/30 ملف (288/288 اختبار أخضر)** مع `lint` بصفر أخطاء. |
| 2026-10-03 | v9.0 | **M9 — ملاحظية وبنية الطوابير الخلفية (Observability & Background Jobs):** **سجل pino موحّد** (`src/lib/observability/logger.ts`) — `logger` + `childLogger(bindings)` يحقن `hotelId`/`actor:'PLATFORM'` آلياً من سياق المستأجر (AsyncLocalStorage) مع redact مسارات مغربية (authorization/cookie/password/tokens/vcc)؛ استُبدل كل `console.*` في مسارات الـ consumer/الوظائف الخلفية/بوابات الإيميل/عملاء VGS·T-Lync·Plutu بصفر مساس بحزمة `prisma.ts` (حافة Edge محفوظة — سلسلة `middleware→jwt→otp→tenant→prisma` خالية من pino). **طابور `webhook` جديد** (`cm-webhook-delivery` — عربة تسليم الويب هوك الصادر مع `MAX_ATTEMPTS=5`، حدّ معدل `60/d` لكل `hotel×provider`، يحترم `Retry-After`، 4xx قاتل بلا إعادة، وإعادة جدولة ذاتية بمعرّف ثابت). **DLQ موحّد** (`cm-dlq`): طابور بلا معالج؛ أي وظيفة تستنفد محاولاتها تُنقل إليه (`moveToDlq`) من معالج `failed` بالحُمولة + `failedReason` + `stacktrace` + `failedAt` + أصل الوجهة. **Backoff** `exponential` + **jitter محلي 0.2** (بدل تكتّل thundering-herd) و`attempts:5` افتراضياً. **Bull Board** انتقل من `/admin/queues` إلى **`/superadmin/jobs`** مسجِّلاً الطوابير الثمانية (الستة + webhook + dlq) داخل حاجز Super-Admin 2FA (كامنت middleware والروابط + مسار `next.config` حُدّثوا). **`/api/health`** (liveness) و**`/api/ready`** (readiness nodejs): PostgreSQL `SELECT 1` عبر `runWithTenant(PLATFORM)` + Redis `PING` + `getQueueHealth` + **حصر RLS آلي** يعيد استخدام `runRlsCensus` المستخرج إلى `scripts/verify-rls.ts` (يبقى `verifyRls` لسلسلة `e2e-prepare-db`). التوثيق في `docs/M9-OBSERVABILITY-ARCH.md`. **`npm run test:e2e` → 22/22** + `tsc`/`lint`/`build` نظيف. |
| 2026-09-24 | v8.17 | **M8 (Phase-2 close-out) — توحيد مصدر الحقيقة + حارس «لا سياق» + حصر RLS آلي:** **سياسة FK قياسية «الفندق لا يُحذف مادياً»** — الـ19 جدولاً مستأجَراً (النواة المالية الخمسة + الـ14 المشتقّة) قيدُها `_hotelId_fkey → Hotel` **`ON DELETE RESTRICT ON UPDATE CASCADE`** (الرفض فوري داخل الجملة لا مؤجَّل). **مصدر حقيقة واحد** في `prisma.ts`: توبّل `HOTEL_SCOPED_MODEL_NAMES` (`as const`، 19) يشتقّ منه كل شيء — `HOTEL_SCOPED_MODELS` و`HotelScopedModelName` و`HotelScopedModelKey = Extract<keyof <Prisma.TransactionClient>, Uncapitalize<…>>` (حذف الاتحاد اليدوي الـ19) — وخريطة `NESTED_HOTEL_MODEL` النسقية **تُشتق حياً من `Prisma.dmmf`** وقت التحميل (كل حقل علاقة هدفه نموذج مستأجَر يدخل تلقائياً؛ فشل إقلاع صاخب عند غياب `dmmf`)؛ استُبدلت قوائم `Record` اليدوية بـ`Map.has`. **حارس «لا سياق = Bug»:** في `$allOperations` بلا سياق (NONE) أي كتابة على نماذج مستأجَرة → **رفض صاخب** (`assertMutationContext`) بدل نجاح صامت بصفر صفوف؛ القراءات تبقى fail-closed؛ و`tenantTx` بلا سياق → رفض صاخب. **`withTenantJob`** (`src/lib/tenant/with-tenant-job.ts`) غلاف BullMQ الوحيد — `job.data.hotelId` → TENANT وإلا PLATFORM — حُشر في كل معالجات `workers/index.ts` (أغلق الفشل الصامت في الوظائف الخلفية). **`verify:rls`** (`scripts/verify-rls.ts` + `npm run verify:rls`): حصر آلي ضد `hotel_management` و`hotel_e2e` — `tenant_isolation=54 tenant_derived=0 allow_all=5 forceRls=59 triggers=19` + مطابقة اسمية للتطويقات + تأكيد `RESTRICT/CASCADE` للـ19 قيداً؛ وُحبك في سلسلة `e2e-prepare-db` (بعد `applyRls`) فأي انحراف يسقط الاختبار بصخب. **`npm run test:e2e` → 22/22** + `tsc`/`lint`/`build` نظيف وRedis PONG. |
| 2026-09-24 | v8.16 | **M8 (Phase-2-b) — تحصين الأطفال المشتقّين وتحويل تطويقات `hotelId` إلى نمط القفل:** الـ14 جدولاً التي كانت تُعزل سابقاً بسياسة `tenant_derived` (EXISTS على سلسلة الأبوين) نمَت عمود `hotelId` حقيقياً — ترحيل يدوي `20260926000000_add_derived_child_hotel_id` يولّده ويطبّقه `scripts/generate-child-hotelid-migration.ts` (ADD → backfill ← الأب → SET NOT NULL → FK → INDEX) على `hotel_management` و`hotel_e2e` و`schema.prisma` متزامن. **19 تطويق اشتقاق `hotelId`** (5 مالية أُعيد توليدها + 14 طفلاً) بصيغة `SELECT … FOR NO KEY UPDATE … SKIP LOCKED` — ترتيب أقفال حتمي **ولا يحجز على أبٍ يُنقل بين الفنادق تزامناً**؛ الرفض `P0001` عند غياب الأب؛ `Invoice` بأبوين اختياريين (`Folio` **أو** `ExternalClient`). **مصدر حقيقة واحد** `generate-child-hotelid-migration.ts` — تستورده `apply-rls.ts` فتعمل فتات قاعدة `prisma db push` الجديدة مطابقةً حرفياً للترحيل. **تقارب صارم في apply-rls:** كل سياسة تبدأ بـ`DROP` للفئتين الأخريين (أزيلت 14 سياسة `tenant_derived` قديمة كانت تتبقى زائدةً على الجداول المنتقلة في جولات سابقة). **التحقق على القاعدتين:** 54 `tenant_isolation` / 0 `tenant_derived` / 5 `allow_all` / 59 FORCE RLS / 19 `trg_*_hotel`. **عزل E2E لـ Redis:** `tests/e2e/setup/rate-limit.ts` يمسح مفاتيح `stepup:*/otp:*/ratelimit:*` قبل كل اختبار — كان اختباران يضربان `429` الحقيقي لتراكم حصة `stepup:request` (`3/15min`) داخل الجلسة الواحدة. **`npm run test:e2e` → 22/22** (4.7m) + `tsc`/`lint`/`build` نظيف. |
| 2026-09-22 | v8.15 | **M8 (Phase-1) — تحصين تعدد المستأجرين عبر Row-Level Security على مستوى قاعدة البيانات:** ثلاثة أدوار تطبيق `app_tenant` (RLS مُفعّل — كل طلب app يعمل به) / `app_platform` (BYPASSRLS — مسارات Super-Admin والجداول العامة) / `app_migrator` (BYPASSRLS — أدوات الصيانة) بصلاحيات وامتيازات افتراضية (`scripts/provision-db-roles.ts`، منشأة فقط عند غيابها لتفادي سباق pg). **محرك RLS `app_hotel_id()`** من GUC الجلسة `app.current_hotel_id` (غير مضبوط → لا صفوف → fail-closed)؛ `scripts/apply-rls.ts` يولّد `prisma/rls/rls.sql`: **40 جدولاً مستأجَراً** (سياسة `tenant_isolation`) + **14 جدولاً اشتقاقياً** بلا `hotelId` (سياسة EXISTS على سلسلة الأبوين) + **5 جداول عامة** (`allow_all`) + **59 جدولاً تحت FORCE RLS** + **5 تطويقات** اشتقاق `hotelId` من الأبوين على الجداول المالية (Folio/الحركات/الخصومات/المستحقات/رسوم الغرفة) كدفاع في العمق. **على مستوى التطبيق:** عميل `prisma` (موسَّع — اعتراض مركزي يحقن `hotelId` تلقائياً في كل create تحت سياق TENANT، أعلى مستوى ونِسقياً عبر `NESTED_HOTEL_MODEL`) + عميل `prismaPlatform` لمسارات المنصة؛ **`tenantTx`** (يقرأ سياق المستأجر من AsyncLocalStorage → يفتح معاملة يضبط GUC داخل النطاق ثم يمرّر `tx` ملفوفاً بـ Proxy يحقن `hotelId` مركزياً — صفر تكرار في مواقع الاستدعاء). **`hotelId` مضاف للنماذج المالية الخمسة** + ترحيل backfill فعلي (`20260922000000_add_financial_hotel_id`) وُطّب على `hotel_management` و`hotel_e2e`. **`scripts/e2e-prepare-db.ts`** يؤمن الآن سلسلة bootstrap كاملة لـ `hotel_e2e` (إنشاء القاعدة → الأدوار → دفع المخطط → RLS) والتطبيق يعمل كـ `app_tenant`. **`npm run test:e2e` → 22/22** + `tsc`/`lint`/`build` نظيف. |
| 2026-09-21 | v8.14 | **SA.7 — واجهة مفاتيح تكاملات الدفع (Schema-driven + رفع صلاحية واعٍ من العميل):** صفحة `/superadmin/integrations` (بطاقات Plutu/T-Lync لكل فندق وفق `PROVIDER_REGISTRY`). كل حفظ/حذف يمرّ عبر `useSudoMutation` (لا اعتراض عالمي — الرفع متعمَّد): عند `403 STEP_UP_REQUIRED` يفتح `SudoProvider` نافذة Step-up مرة واحدة (قفل single-flight + طابور — أي عدد من الطفرات المتزامنة يُعاد بعد **OTP واحد**) ثم يعيد تشغيل الطلب بـ `x-sudo-token` (نافذة 5 دقائق بذاكرة وحدة — لا localStorage). مفاتيح بصرية أمنية: صفر تسريب (`hasKey` فقط، حقل «تعديل» يعبّئ قناعاً، لا عرض للسر) + switches تفعيل/Sandbox + حذف ببطاقة تأكيد. **ترقية `hotels`/`invitations` إلى `withPlatformAuth`** (الكوكي httpOnly يعبر أخيراً + `tv` إلزامي) و**إصلاح `rate-limit.ts`**: سطل كل مسار `${method} ${path}:${ip}` بدل IP وحده (كان استنزاف مسار يقفل حصة الآخرين). **3 كسور كشفها E2E وتم إصلاحها**: `Badge` كان يهمل `data-testid`؛ `saveEngine` كان يتجاهل الأسرار في أول تهيئة (شرط `revealSecrets` الذي لا يوجد أول مرة) → `hasKey:false`؛ وسطل الـ login المشترك يسبب `429` للاختبارين 3-4. **E2E.1.7 `tests/e2e/superadmin-integrations-ui.spec.ts`** — 4 سيناريوهات (رحلة سودو كاملة · كاش النافذة · فخ الالتزامن · حذف يرفع). **`npm run test:e2e` → 22/22** (بنية 4 + مصادقة 5 + سودو 2 + دفع الضيف 7 + تكاملات 4) + `tsc`/`lint` نظيف. |
| 2026-09-21 | v8.13 | **E2E.3 — تكملة رحلة دفع الضيف (5 سيناريوهات تُتم قائمة §6 في E2E-TESTING-ARCH):** داخل نفس `tests/e2e/guest-payment.spec.ts` وفيها عُمِّم البذر (خيار `gateway` في `seed-guest-payment.ts`؛ IntegrationConfig engine `tlync`): (1) **نجاح T-Lync** — مسار البوابة الثانية كاملاً → `checkout-success` → `Payment TLYNC` و`GatewayWebhook payment.success PROCESSED`؛ (2) **فشل الدفع** — `dg-fail` يُسلّم webhook `FAILED` قبل العودة → جلسة `FAILED`، صفر دفعات/حركات وWebhook واحد `payment.failed PROCESSED`؛ (3) **العودة قبل الـ webhook ثم تسوية البوابة (حلقة M6 الحقيقية)** — `dg-cancel` (بلا webhook) → شاشة «في انتظار تأكيد الدفع» تستطلع ثم `__control/settle` → الاستطلاع يلتقط `SUCCEEDED` → `checkout-success`؛ (4) **ازدواج الويب هوك** — `__control/duplicate` → دمج على `(provider, hotelId, eventId)` → Webhook/دفعة/حركة واحدة وتسوية واحدة؛ (5) **Create مرفوض** — `__control/fail-create` → شاشة «فشل الدفع» برسالة «فشل إنشاء جلسة الدفع» وصفر وحدات `PaymentSession` (لا تُنشأ قبل نجاح البوابة). **كسر إنتاجي حقيقي كشفه السيناريو 3**: استطلاع «غير المؤكَّدة» كان يقرأ `body?.verified` بينما المسار يردّ `successResponse({verified})` المغلفة بـ`data` فيبقى `undefined === true` أبداً فلا تنقلب الشاشة لنجاح بعد تسوية متأخّرة؛ صار يقرأ `body?.data?.verified` (`UnverifiedSuccessView.tsx`) فتعمل حلقة M6 فعلياً. **`npm run test:e2e` → 18/18** (2.8m؛ بنية 4 + مصادقة 5 + سودو 2 + دفع الضيف 7) + `tsc`/`lint` نظيف. |
| 2026-09-19 | v8.12 | **E2E.2 — رحلة دفع الضيف عبر البوابة الإلكترونية (Playwright، Dummy Gateway):** مجموعة `tests/e2e/guest-payment.spec.ts` (سيناريوان على منصة Plutu): **الرحلة السعيدة** — الضيف يختار Plutu، يُوجَّه لصفحة البوابة المزيّفة، يدفع بنجاح فيعود لـ `?step=success`، ويُصفَّر الدفتر (Folio `SETTLED` ورصيد 0، الجلسة `SUCCEEDED` مربوطة بالدفعة، حركة `FolioTransaction −250`، و`GatewayWebhook PROCESSED`)؛ **ومطاردة الويب هوك المزوَّر** — توقيع مزوَّر من خطّ التحكم `__control/forge` → `401 UNAUTHORIZED` والدفتر بلا مساس (رصيد ثابت، جلسة `PENDING`، صفر Payment/Webhook/حركات) ثم شاشة «تعذر تأكيد حالة الدفع» بعد استنفاد الاستطلاع. **بذر كامل بشجرة واقعية** (`setup/seed-guest-payment.ts`): Hotel → RoomType → Room → **Guest** → Booking → **BookingRoom** → Folio → IntegrationConfig يسلك مسار `resolveGatewayConfig` الحقيقي (تشفير `apiKeyEnc` AES-GCM بمفتاح الاختبار + `config` نصياً لا يُفكّك) فتمارس الاختبارات طبقات الحجز والدفع كافة لا حوافّ مفرَّغة. **4 وسوم `data-testid`** (بطاقة البوابة/التوجيه/النجاح/غير المؤكَّد). **كسوران اكتُشفا في أثناء الرحلة وسُجّلا**: (1) Dummy Gateway — زر «العودة دون دفع» كان نموذج GET يحيل إلى `return_url` فيُسقط المتصفح `?step=success` (استبدال استعلام النموذج الفارغ) ويعود الضيف لشاشة اختيار الطريقة؛ صار نموذج POST يُدير الخادم `302` نحو الـ `return_url` كاملة بلا إشعار فِعلي (مطابق للواقع). (2) مسارا `POST /payment-session` و`GET /payment-session/[sessionId]/status` كانا يتعطّلان بـ500 عند توقف Redis بينما سائر المسارات تفتح الباب (fail-open) — رُصد انقطاع Redis حقيقياً في سجل E2E؛ صارا يلتزمان نفس الخطة ويُسجّلان «Redis limiter unavailable, failing open» بدل تحطّم غير مُلتقَط. **`npm run test:e2e` → 13/13** (2.2m؛ بنية 4 + مصادقة 5 + سودو 2 + دفع الضيف 2) + `tsc`/`lint` نظيف. |
| 2026-09-18 | v8.11 | **SA.6 — Step-up / Sudo Mode للعمليات الحسّاسة (Backend خالص + اختبارات أمنية):** طفرات `/api/superadmin/integrations` (POST/DELETE) تشترط الآن **إعادة إثبات الهوية** عبر كود Step-up يصل بالبريد (غرض `SUPER_ADMIN_STEP_UP` — لا صلة باختبار الدخول 2FA). مساران: `POST /api/superadmin/auth/step-up/request` (حدّ `3/15min`) و`/verify` (حدّ `5/60s`؛ قوس محاولات/قفل/استهلاك كـالدخول؛ `customTtl` في `requestOtp` بلا تغيير على مسار الدخول؛ **سقف صلب ≤ 300s** لكود الـ Step-up). النجاح يمنح **`su_token`** (JWT عديم الحالة بمفتاح منفصل `SUPERADMIN_STEP_UP_JWT_SECRET`، نطاق `superadmin:integrations`، **window-use** داخل نافذة سودو 5 دقائق، بلا تجديد). الحارس `withSudoMode` **يُلصق بعد** `withPlatformAuth` (تركيب لا تعديل؛ `GET` خارج السودو): بلا رأس → `403 STEP_UP_REQUIRED`؛ توقيع/انتهاء مكسور → `403 STEP_UP_EXPIRED` + تدقيق `STEP_UP_EXPIRED_REJECTED`؛ نطاق/موضوع مخالف → `403 STEP_UP_REQUIRED` بلا ضجيج؛ كل نجاح → `STEP_UP_USED`. **صفر Schema** (`OtpPurpose.SUPER_ADMIN_STEP_UP` مسبق). **E2E.1.6 `tests/e2e/superadmin-step-up.spec.ts`** (رحلة سودو كاملة بالحقن + رفض تزويرات `su_token` بمفتاح صحيح/خاطئ/منتهٍ/نطاق/موضوع) — بكشف حفرة **`Secure` كوكي لا يصل `page.request` فوق http** وحلٍّ عبر إعادة سكّ الكوكيات بلا `Secure` (`demoteSessionCookies` — صفر كود إنتاج). **`npm run test:superadmin-otp` → 62/62** (21 فحصاً SA.6، خروج 0) و`npm run test:e2e` → **11/11** (بنية 4 + مصادقة 5 + سودو 2) + `tsc`/`lint` نظيف. |
| 2026-09-18 | v8.10 | **E2E.1.5 — اختبارات الواجهة للمصادقة الثنائية لـ Super-Admin (Playwright):** كُتبت أول مجموعة E2E للواجهة `tests/e2e/superadmin-auth.spec.ts` (5 سيناريوهات: حاجز Middleware، رحلة 2FA كاملة بالكود المعروف، كود خاطئ + عدّ المحاولات، إعادة الإرسال مع التهدئة، تسجيل الخروج وإبطال الجلسة). **استراتيجية الحقن (Option C — Prisma Injection، بقرار InfoSec):** عُبّارة Playwright تصل مباشرة لقاعدة `hotel_e2e` وتحقن `OtpChallenge.codeHash` بالكود المعروف (`123456`) — **بلا أي مسار `/api/test/*` داخل تطبيق الإنتاج** (رُفض كـ «ثغرة نائمة» بنظام Zero-Trust) وبلا تعديل على منطق الإنتاج؛ المتصفح يمارس الواجهة والـ API الحقيقي ويُدخل الكود بضغطات مفاتيح حقيقية (`keyboard.type` — لأن حقول OTP تقطّع وتتقدم تلقائياً). **Dual Time Sync (اختبار التهدئة):** تهدئة `Retry-After` تتحقق في طبقتين — حقن `lastCodeSentAt` في DB (نصف الخادم) + `page.clock.pauseAt` (نصف المتصفح) — لأن تزوير إحداهما وحدها لا يحرّر المسار. عزل تام بلا `storageState` (`beforeEach` يصفّر `OtpChallenge`/`RefreshToken` ويتيح حساب الاختبار). وسوم `data-testid` في 4 ملفات واجهة + `retries: process.env.CI ? 1 : 0` (اعتماد الإدارة: Retry واحد يمتص ضجيج CI فقط). **اختبار `npm run test:e2e` → 9/9** (بنية 4/4 + مصادقة 5/5) + `tsc --noEmit` نظيف + `next lint` بلا أخطاء. |
| 2026-09-18 | v8.9 | **SA.5 — واجهة دخول المصادقة الثنائية وحاجز لوحة التحكم (Server-Side):** شاشة العامل الأول `/superadmin/login` + شاشة OTP `/superadmin/otp` — **الحاجز Server Component** يقرأ كوكي التحدي `sa_otp` (Path=`/` لكي يصل للصفحة ومسارات `/api/superadmin/auth/*` معاً) ويتحقق من التحدي الحيّ في DB ثم يرسم 6 خانات (إتمام تلقائي، اهتزاز للكود الخاطئ، عدّاد صلاحية + تهدئة إعادة الإرسال عبر `Retry-After`). هيكل مجموعات `(superadmin)/superadmin/(auth)` (بطاقات مركزية) و`(dashboard)` (Sidebar + Tabs)؛ **نقل `(dashboard)/superadmin/*` → `(superadmin)/superadmin/(dashboard)/` وإزالة حاجز `localStorage` نهائياً** (AGENTS §10) — الحاجز الآن من الخادم: `verifyAccessToken` + `role==='SUPER_ADMIN'` + `tv===true` + استعلام DB. Middleware يستثني `/superadmin/login`+`/superadmin/otp` ويعيد توجيه بقيّة `/superadmin/*` إلى `/superadmin/login`؛ `POST /api/superadmin/auth/logout` يُبطل الجلسة (family) ويمسح الكوكيز (ملف 403 بلا CSRF). `/auth/login` القديم يعترض `SUPER_ADMIN` → `/superadmin/login`. اختبار `npm run test:superadmin-otp` **42/42** + كامل 284/284 + tsc/eslint نظيف. |
| 2026-09-18 | v8.8 | **SA.2.5 — إعادة إرسال OTP (`POST /api/superadmin/auth/resend-otp`):** هوية المستخدم من كوكي التحدي `sa_otp` (لا إيميل من الجسم — يمنع Spam/DoS على صندوق المالك وعدّاد Enumeration)، `withCsrf` + سقف موزّع `3/5min` (fail-open كـ`verify-otp`)، أرضية تهدئة `SUPERADMIN_OTP_RESEND_COOLDOWN_SECONDS` (60ث) من `OtpChallenge.lastCodeSentAt ?? createdAt` (تحسب رسالة الدخول الأولى)، إبطال الكود القديم (استبدال `codeHash`) + تصفير المحاولات + تمديد `expiresAt` **في نفس صف التحدي** + إعادة إصدار الكوكي بصلاحية ممدَّدة، وردّ `429 + Retry-After` عند التهدئة، و`PlatformAuditLog` للنجاح والفشل. Migration `20260918000000_add_otp_resend_cooldown`. اختبار `npm run test:superadmin-otp` 30/30 (+10 حالات) + كامل 284/284 + SA.4 26/26 + typecheck/eslint نظيف. |
| 2026-09-17 | v8.7 | **SA.4.5 — ربط مفاتيح بوابات الدفع بالتشغيل:** `resolveGatewayConfig` (`gateway-config.ts`) — قراءة DB واحدة بلا Cache من `IntegrationConfig` (فكّ حزمة `{merchantId, secretKey}` + overlay غير سرّي)، رفض 400 `GATEWAY_CONFIG_UNAVAILABLE` عند صفٍّ معطَّل/ناقص (لا نجوعاً إلى `.env` — بلا عبور-مستأجر)، و`env` فقط عند غياب صف. `payment-session` يحلّ عبر `hotelId` ويُمرّر config محلولاً ذرياً لنداء البوابة ولقطة `PaymentSession.gatewayConfig`؛ الـ Adapter (`hotelId` في `GatewayAdapterOptions`) يحلّ تلقائياً عند الحاجة؛ الـ Webhook بلا تغيير (لقطة `gatewayConfig` تثبت تدوير المفاتيح في منتصف الجلسة). اختبار `tests/integration/gateway-wiring.test.ts` 10/10 + كامل 284/284 + SA.4 26/26 + SA.2 20/20 + typecheck/eslint نظيف. |
| 2026-09-12 | v8.4 | **Sprint 2 (Channel Manager) + Phase 0/1 BullMQ:** نماذج `ChannelProvider`/`ChannelMapping`/`ChannelPriceSnapshot`، `ChannelManagerService` (build/store/ingest)، APIs إدارة الخرائط/المعاينة/النشر (202)، Webhook وارد `external/channel/[provider]/bookings` (idempotent)، لوحة الإدارة `/admin/channel-manager`. **Phase 0:** bullmq@6.3.4 + ioredis@6، 5 طوابير `cm-*`، عامل واحد `worker-cm`، JobScheduler (02:00/03:00)، healthcheck endpoint، docker-compose + railway.toml. **Phase 1:** Bull Board على `/admin/queues` (Hono + cookie SUPER_AUTH)، publish يرسل pushToOTA jobs، timezone-safe date formatting، typecheck + 240/240 أخضر. |
| 2026-09-12 | v8.5 | **Phase 2 BullMQ Job Processors:** 5 معالجات حقيقية — `buildSnapshot` (cursor pagination 200-day chunks)، `pushToOTA` (bucket-per-date idempotency، dynamic Retry-After، 4xx=fatal)، `processInboundBooking` (CRITICAL priority، idempotent via externalRef)، `pushRatePlan` (date-range iteration)، `reconcileInventory` (daily drift detection، cursor pagination). **VCC/PCI-DSS Foundation:** schema migration مع حقول VCC/VGS (`vccToken`, `vccExpiryToken`, `vccCVVToken`, `vccProvider`, `vgsVaultId`, `vccPurgedAt`)، نموذج `VCCAuditLog` للامتثال، `vcc-normalizer.ts` (Factory pattern per OTA: Booking.com/Expedia/Airbnb/Agoda/Trip)، تحديث `ChannelManagerService` و `processInboundBooking.job` لتخزين Tokens فقط (PCI-DSS SAQ A ready). Typecheck + 240/240 أخضر. |
| 2026-09-12 | v8.6 | **W2 VGS Proxy Integration:** مساران جديدان — `/api/external/channel/vgs/[provider]/bookings` (إنتاج، يتوقع payload بعد VGS Proxy مع signature verification) و `/api/external/channel/vgs-simulator/[provider]/bookings` (تطوير، يحاكي VGS tokenization محلياً). `vcc-normalizer.ts` محدث مع `extractExpediaVCC` (concat first+last name) و `extractGenericVCC` مرن (يقبل token fields في الجذر أو داخل `payment`). اختبارات وحدة 11/11 للنورمالايزر + Simulator endpoint. Total tests: 251/251 أخضر. |
| 2026-09-12 | v8.5 | **Phase 2 BullMQ Job Processors:** 5 معالجات حقيقية — `buildSnapshot` (cursor pagination 200-day chunks)، `pushToOTA` (bucket-per-date idempotency، dynamic Retry-After، 4xx=fatal)، `processInboundBooking` (CRITICAL priority، idempotent via externalRef)، `pushRatePlan` (date-range iteration)، `reconcileInventory` (daily drift detection، cursor pagination). **VCC/PCI-DSS Foundation:** schema migration مع حقول VCC/VGS (`vccToken`, `vccExpiryToken`, `vccCVVToken`, `vccProvider`, `vgsVaultId`, `vccPurgedAt`)، نموذج `VCCAuditLog` للامتثال، `vcc-normalizer.ts` (Factory pattern per OTA: Booking.com/Expedia/Airbnb/Agoda/Trip)، تحديث `ChannelManagerService` و `processInboundBooking.job` لتخزين Tokens فقط (PCI-DSS SAQ A ready). Typecheck + 240/240 أخضر. |
| 2026-08-06 | v8.3 | **المرحلة 3 — الحجز عبر الموقع (M0+M1+M2):** مهاجرة `BookingRoom_roomType_nullable_roomid` (إضافة `roomTypeId` + backfill + `roomId` اختياري + فهرس) + `RoomType.isWebVisible`/`webRoomLimit`/`webPrice` + حلّ المستأجر مع بديل محلي (localhost) في التطوير + إصلاح مفاتيح سياسات الإلغاء في البذرة + **محرك التوفر والتسعير للويب**: `GET /api/public/availability` بنوع الغرفة (حصة `min(webRoomLimit − PENDING، فيزيائية)` + تفصيل مالي عبر `computeWebPricing`) + `POST /api/public/bookings` يستقبل `roomTypeId` (لا `roomId`) ويحفظ لقطة مالية على `Booking` (`webTaxAmount`/`webFeesAmount`/`webDiscountAmount`/`webTotalAmount`) مع إشعار RECEPTION `BOOKING_REQUEST` + تحديث `RoomSelector`/`GuestForm`/`book` لبطاقات أنواع الغرف والحصة والتفصيل المالي (214 اختبار ✅) |
| 2026-08-03 | v8.1 | **تدقيق شامل وإصلاحات Ledger/الدفع:** توحيد تعداد `PaymentMethod` بين Prisma والمشترك (`SADAD`, `TADAWUL`, `BANK_TRANSFER`, `CARD`, `POS`) — إصلاح فشل إيداع/سحب المحفظة بطرق CARD/حوالة (كانت تُرفض كقيم غير صالحة) + استبدال قيم `TRANSFER`/`CHEQUE` في واجهة المحفظة وملصقاتها (Modal, Table, إيصال PDF, تقارير) + عدّاد `BookingNumberCounter` ذرّي لـ `bookingNo` (إزالة سباق الأرقام المتكررة في الحقن المتزامن) + إكمال سجل الدفع في `checkIn` (`gateway`/`idempotencyKey`) + تخصيص الاسترداد تسلسلياً عبر مدفوعات متعددة في `cancelWithRefund` (منع الازدواج) (159 اختبار ✅) |
| 2026-08-03 | v8 | **Decoupled PMS Ledger:** إزالة بوابات الدفع الخارجة نهائياً — `PaymentProviderConfig` → `IntegrationConfig` (مفاتيح مشفّرة AES-256-GCM لكل فندق) + حذف `lib/gateways/*` و `api/webhooks/[provider]` و `api/admin/payment-providers/*` + `POST /api/integrations/[engine]/bookings` (حقن حجز مؤكد + دفع SUCCEEDED + تسوية في معاملة واحدة مع دفتر Idempotency `GatewayWebhook`) + `middlewares/external-auth` + صفحة `/admin/integrations` (توليد/تدوير مفتاح) + `payments/create` أصبح تسجيلاً يدوياً (159 اختبار ✅) |
| 2026-08-02 | v3.7 | بوابات دفع متعددة لكل مستأجر: `PaymentProviderConfig` (مفاتيح مشفّرة AES-256-GCM) + `GatewayWebhook` (دفتر Idempotency) + مُهايئات بلا حالة (Stripe/MobiCash/Sadad/Tadawul) + `PaymentService` يحدد البوابة حسب `hotelId` + Webhook موحّد `/api/webhooks/[provider]` (دقة المستأجر من المفتاح المخزّن) + مسارات `/api/admin/payment-providers/*` + صفحة `/admin/payment-gateways` (156 اختبار ✅) — **مُستبدَلة في v8** |
| 2026-08-02 | v3.6 | لوحة التحكم العليا: `GET /api/superadmin/hotels` + `GET /api/superadmin/invitations` + `POST /api/superadmin/invitations/[id]/resend` (يجدد التوكن والصلاحية ويبطل القديم) + صفحات `/superadmin/hotels` و `/superadmin/invitations` (جدول فنادق + إنشاء فندق بعرض رابط الدعوة ونسخ فوري + تعديل النطاق + إعادة إرسال الدعوات) + حماية مزدوجة (Edge Middleware + Layout guard) (146 اختبار ✅) |
| 2026-08-02 | v3.5 | White-Label SaaS: customDomain لكل فندق + تحديد الفندق عبر hostname (الثقة بـ x-forwarded-host فقط عبر Cloudflare `cf-ray`/`TRUST_PROXY`) + قفل دخول صارم لكل فندق + نقطة سياق العلامة `/api/auth/context` + روابط دعوات على نطاق المنصة الأساسي + كوكيز host-only بلا Domain (133 اختبار ✅) |
| 2026-07-31 | v3.4 | SaaS Onboarding: تعطيل التسجيل الذاتي نهائياً + نموذج Invitation (توكن مخزّن كـ SHA-256، صلاحية 7 أيام) + مسار Super-Admin لإنشاء الفندق + صفحة تفعيل الحساب (114 اختبار ✅) |
| 2026-07-31 | v3.3 | عزل متعدد الفنادق (Multi-Tenancy): إلزام hotelId عبر كل الخدمات والمسارات، نطاق النزلاء بمعرّف الفندق، اختبارات عزل أمان شاملة (101 اختبار ✅) |
| 2026-07-31 | v3.2 | وثائق النزلاء (جوازات/بطاقات) بتخزين خاص محمي + اختبارات أمان مسار API (مصادقة/أدوار/CSRF) |
| 2026-07-17 | v3.1 | المرحلة 4: نقل غرفة، تمديد إقامة، سياسات إلغاء، حجوزات مجموعات، Tape Chart + محرك مالي + checkout strictness |
| 2026-07-17 | v3.0 | QA Round 1: 7 إصلاحات + توثيق شامل + نشر GitHub |
| 2026-07-16 | v2.5 | إضافة Guest, Wallet, POS, Safe Deposit, Lost & Found, Reports |
| 2026-07-15 | v2.0 | إدارة الحجوزات الكاملة، Folio Billing، Check-in/Check-out |
| 2026-07-07 | v1.0 | MVP: هيكل المشروع، المصادقة، الغرف، الفوترة الأساسية |

---

## 🧠 القرارات المعمارية والمشاكل المحلولة (Architectural Insights & Solved Pitfalls)

This section documents critical bugs, race conditions, and systemic flaws discovered during audits — along with their root causes and the architectural solutions implemented. **Future developers: read this before modifying the affected areas to avoid re-introducing these vulnerabilities.**

---

### 1. Enum Drift — Prisma DB vs Shared Schema for `PaymentMethod`

**Problem/Risk:**
- Prisma enum (`schema.prisma`) had: `STRIPE, PAYPAL, MOBICASH, IDFA3LY, YASERPAY, ONEPAY, CASH, POS, WALLET`
- Shared enum (`packages/shared/src/enums.ts`) had: `STRIPE, PAYPAL, MOBICASH, SADAD, TADAWUL, BANK_TRANSFER, IDFA3LY, YASERPAY, ONEPAY, CASH, CARD, WALLET`
- **Divergence:** Prisma missing `SADAD, TADAWUL, BANK_TRANSFER, CARD`; Shared missing `POS`.
- **Live bug:** `WalletTransaction.method` is typed as Prisma enum → wallet deposit/withdraw with `CARD`, `BANK_TRANSFER`, `SADAD`, `TADAWUL` failed at runtime with Prisma validation error (500). The UI modal offered `TRANSFER`/`CHEQUE` which existed in **neither** enum.

**Architectural Solution/Prevention Mechanism:**
1. **Unified both enums** to the complete set: `STRIPE, PAYPAL, MOBICASH, SADAD, TADAWUL, BANK_TRANSFER, IDFA3LY, YASERPAY, ONEPAY, CASH, CARD, POS, WALLET`.
2. **Added warning in README payment-methods table** (v8.1): "تعداد `PaymentMethod` موحّد بين `schema.prisma` و `@hotel/shared` — أي إضافة طريقة دفع جديدة يجب أن تحدّث الطرفين معاً."
3. **Replaced invalid modal values** (`TRANSFER`→`BANK_TRANSFER`, dropped `CHEQUE`) and updated all label maps (`WalletTransactionModal`, `WalletTransactionTable`, `wallet-receipt-pdf.service`, `admin/reports/page.tsx`).
4. **Prevention:** Any future payment-method addition MUST update both `schema.prisma` AND `packages/shared/src/enums.ts` in the same PR, and the README warning serves as a permanent reminder.

---

### 2. BookingNo Race Condition — Atomic Counter via `BookingNumberCounter`

**Problem/Risk:**
- `generateBookingNumber()` scanned the latest booking by `createdAt desc` **outside** the injection transaction.
- Under concurrent `POST /api/integrations/[engine]/bookings` calls, two requests could read the same "last booking", compute the same sequence, and collide on the `booking.bookingNo` `@@unique` constraint (P2002).
- The integration service caught **all** P2002 errors as `duplicate: true` — so a genuine bookingNo collision between two different bookings would be silently reported as a duplicate retry, losing the second booking entirely.

**Architectural Solution/Prevention Mechanism:**
1. Added `BookingNumberCounter` model with a single row (`key='bookingNo'`, `value`).
2. Rewrote `generateBookingNumber()` to use **atomic** `UPDATE … SET value = value + 1 RETURNING value` inside a short `prisma.$transaction`.
3. On first use (empty counter), it self-seeds from the max existing `bookingNo` sequence to never reuse numbers.
4. **Result:** Sequential, collision-proof booking numbers even under high-concurrency injection bursts. The integration service's P2002 handler now only triggers for true duplicate webhook/externalRef deliveries.

---

### 3. Over-Refund Bug in `cancelWithRefund` — Serial Allocation Prevents Double-Counting

**Problem/Risk:**
- `cancelWithRefund` iterated over ALL succeeded payments and applied the **full** `refundAmount` to each:
  ```ts
  refundedAmount: { increment: refundAmount }  // ❌ adds full amount to EVERY payment
  status: refundAmount >= payment.amount ? 'REFUNDED' : 'SUCCEEDED'
  ```
- On a folio with multiple partial payments (e.g., 500 + 300), a refund of 400 would increment **both** payments by 400 → total `refundedAmount` = 800 (double the actual refund).
- Status logic also misfired: a 300 payment would be marked `REFUNDED` because 400 ≥ 300, even though it only contributed 300 to the total.

**Architectural Solution/Prevention Mechanism:**
1. Replaced the loop with **serial allocation**: consume `refundAmount` across payments, capping each at its remaining refundable balance (`amount - refundedAmount`).
2. Each payment now gets exactly its fair share; status correctly transitions to `PARTIALLY_REFUNDED` or `REFUNDED`.
3. Leftover `remaining > 0` after exhausting all payments is harmless (quote logic already ensures `refundAmount ≤ totalPaid`).
4. **Pattern:** Any future multi-payment refund/distribution logic MUST use this serial-consumption pattern — never apply a lump sum to every payment.

---

### 4. Ledger Consistency — Enforcing `gateway` / `idempotencyKey` in Fast Check-In Flow

**Problem/Risk:**
- `payments/create` (manual front-desk) logs every SUCCEEDED payment with:
  - `gateway = method.toLowerCase()`
  - `gatewayPaymentId = \`${gateway}_\${idempotencyKey}\``
  - `idempotencyKey = crypto.randomUUID()`
- `bookingService.checkIn()` (reception fast path) created a `Payment` row with **none of these fields** — just `method`, `amount`, `status: SUCCEEDED`.
- This broke ledger uniformity: check-in payments lacked audit trail fields (`gateway`, `idempotencyKey`), making reconciliation and debugging harder.

**Architectural Solution/Prevention Mechanism:**
1. Updated `checkIn` payment creation to include:
   - `gateway: payment.method.toLowerCase()`
   - `gatewayPaymentId: \`checkin_\${crypto.randomUUID()}\``
   - `idempotencyKey: crypto.randomUUID()`
2. **Principle:** Every `Payment` row, regardless of origin (manual, check-in, integration injection), MUST have `gateway`, `gatewayPaymentId`, and `idempotencyKey` populated. The Decoupled PMS Ledger demands a complete, queryable audit trail for every ledger entry.

---

### 5. Wallet Options Cleanup — Standardizing `BANK_TRANSFER` Across All Modals & Reports

**Problem/Risk:**
- `WalletTransactionModal` offered `TRANSFER` (Arabic: حوالة بنكية) and `CHEQUE` — neither existed in the Prisma `PaymentMethod` enum.
- `WalletTransactionTable` and `wallet-receipt-pdf.service.ts` had hardcoded label maps for `TRANSFER`/`CHEQUE`.
- `admin/reports/page.tsx` used ternary chains checking for `TRANSFER`/`CHEQUE` for display.
- Result: Selecting "حوالة بنكية" or "شيك" in the wallet modal caused immediate 500 (Prisma enum validation failure). Reports also couldn't display these methods correctly.

**Architectural Solution/Prevention Mechanism:**
1. **Single source of truth for method labels:** Updated all four files to use the canonical enum values (`CASH`, `CARD`, `BANK_TRANSFER`, `POS`).
2. Replaced `TRANSFER` → `BANK_TRANSFER` everywhere; dropped `CHEQUE` (not a supported payment method in this region's banking context).
3. Added `POS` label (`🏧 نقاط بيع`) to reports table since the enum now includes it.
4. **Prevention:** Never invent UI-only payment-method strings. The dropdown options MUST come from or match the shared `PaymentMethod` enum. Any new method requires: Prisma enum + Shared enum + UI labels (Modal, Table, PDF, Reports) — all in one change.

---

### 6. Capacity Filtering for Party Size — Server-Side (API) Is the Single Source of Truth

**Problem/Risk:**
- The public booking flow filters available rooms by party size (`adults`/`children`). If filtering lived only in the client (`filterRoomsByCapacity`), any other consumer of `GET /api/public/availability` (a future channel manager, a custom widget, a raw API call) would receive rooms that cannot actually hold the requested party — and `POST /api/public/bookings` would be the only place catching it, after a confusing UX loop.
- Capacity per room is not static: it comes from the active rate plan (`maxAdults`/`maxChildren`) falling back to the room type `capacity` — so the number cannot be computed reliably outside the service/pricing layer.

**Architectural Solution/Prevention Mechanism:**
1. `GET /api/public/availability` now computes `maxAdults`/`maxChildren` once per room (rate plan `maxAdults`/`maxChildren`, falling back to `roomType.capacity`/`0`) and **skips rooms that don't fit the requested `adults`/`children`** before returning the payload.
2. The response exposes `maxAdults`/`maxChildren` on each `availableRoom` so clients can render capacity badges without re-deriving business logic.
3. The client-side `filterRoomsByCapacity` remains as a defensive second layer, but the API result is authoritative.
4. **Prevention:** Any future party-capacity or pricing-derived filtering MUST be enforced in the API/service layer (never client-only), because API responses are consumed beyond the React app.

---

### 7. React Reserved Word `children` — Renamed to `childCount` in Public Booking State

**Problem/Risk:**
- The booking form state/props used `children` (for the number of child guests). React reserves `children` as the built-in prop for composing elements; using it as an ordinary state/prop name caused TypeScript errors (`TS2304`/`TS18004` — cannot find/conflict) inside the public `(public)/book` page and `GuestForm`.
- This is a recurring footgun: the public API endpoints legitimately use `children` (JSON field), while React components in the same feature must not.

**Architectural Solution/Prevention Mechanism:**
1. Renamed the React-side state/prop to `childCount` everywhere in the public booking UI (`book/page.tsx`, `GuestForm`).
2. The mapping to the wire format happens only at the API boundary (`childCount` → `children` in the `POST /api/public/bookings` body).
3. **Prevention:** Inside any React component of this app, never name a variable/prop `children`. Keep `childCount` in UI state and translate to `children` only in the request payload.

---

### 8. Prisma Column Type Mismatch — `roomTypeId` UUID vs Legacy Text `RoomType.id`

**Problem/Risk:**
- Creating a foreign key on the new `BookingRoom.roomTypeId` (declared as `String`/UUID) against `RoomType.id` failed with PostgreSQL error `42804` — because the existing `RoomType.id` column is stored as **text** in the database (legacy), while a fresh `String @id @default(uuid())` Prisma column maps to `uuid`.
- Prisma does not expose a raw `text` type mapping for a `String @id` PK, so `prisma db push` silently creates `uuid` and the FK creation errors at the DB level.

**Architectural Solution/Prevention Mechanism:**
1. The migration `20260806000000_bookingroom_roomtype_nullable_roomid` deliberately **skips the FK constraint** for now (keeps the `@@index([roomTypeId])` for query performance). Prisma relations still work through the index; referential integrity is enforced application-side (all lookups are `where: { id, hotelId }` scoped).
2. **Prevention:** When unifying the PK column types (e.g., `ALTER TABLE "RoomType" ALTER COLUMN "id" TYPE uuid USING id::uuid` plus dependent FK columns), do it in a dedicated migration with a data backfill, and re-run `prisma db push` afterwards — this is tracked as an open M0 item.

---

### 9. Web Quota Race Window — PENDING Re-count Is a Pre-Check, Not Fully Atomic

**Problem/Risk:**
- The quota guard in `POST /api/public/bookings` re-counts PENDING web reservations for a room type immediately before creation (inside `onlineAvailable` computation). Two near-simultaneous requests can both pass the `count()` and both create bookings, transiently exceeding `webRoomLimit`.
- The `BookingService.create` transaction creates the `Booking` + `BookingRoom`, but the quota check currently lives *outside* that transaction.

**Architectural Solution/Prevention Mechanism:**
1. M2 ships the quota check as a **pre-check** before the transaction — it eliminates the common oversell case (notable when combined with the availability endpoint using the same formula, so the UI and the API agree).
2. **Resolved in v9.2 (M3):** the PENDING re-count + physical-availability count now run *inside* `BookingService.create`'s `tenantTx`, preceded by a `SELECT id FROM "RoomType" … FOR UPDATE` row lock. Concurrent requests serialize on the room-type row, so the loser re-counts the winner's PENDING booking and raises `ConflictError` (409). The public route's `onlineAvailable` remains a UX pre-check only; the service is the authority. Stale PENDING slots are released by the hourly `hourly-web-booking-expiry` scan (`confirmationCutoffHours`).

---

### 10. `prisma migrate dev` Broken by a Non-Replayable Legacy Migration (Shadow DB)

**Problem/Risk:**
- `npx prisma migrate dev` fails on **every** run with `P3006` against the shadow database: migration `20260806000000_bookingroom_roomtype_nullable_roomid` executes `"roomTypeId" IS NOT NULL`-style casts where `column "roomTypeId" is of type uuid but expression is of type text` (the known legacy type mismatch, see Pitfall #8). This makes the shadow-DB drift check unusable — and blocks creating new migrations through the normal path.
- Without a migration file, a schema change is "dangling" (AGENTS: undocumented/in-migrated code does not exist).

**Architectural Solution/Prevention Mechanism:**
1. Safe manual procedure (used for `add_superadmin_2fa` and `add_integration_kind`):
   `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` → write SQL into `prisma/migrations/<timestamp>_<name>/migration.sql` → `prisma db execute --file <migration.sql>` → `prisma migrate resolve --applied <name>`.
2. Verify afterwards with `prisma migrate status` (DB schema up to date).
3. **Prevention:** the legacy migration must eventually be rewritten to be replayable on a fresh DB (align `roomTypeId` uuid cast), which unblocks `migrate dev` for the whole team.

---

### 11. Prisma Client Regeneration Fails with `EPERM` on Windows When `next dev` Holds the Engine Binary

**Problem/Risk:**
- After a schema change, `npx prisma generate` fails with `EPERM: operation not permitted, rename …\node_modules\.prisma\client\query-engine-windows.exe.tmp*`. A running `next dev` has the Prisma query-engine binary loaded/held, so Windows refuses the atomic rename of the generated engine.

**Architectural Solution/Prevention Mechanism:**
1. Identify the owner: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where CommandLine -match 'next'`.
2. Gracefully stop the `next dev` process tree, run `prisma generate`, then **restart the dev server on the same port** (for this repo: `node node_modules/next/dist/bin/next dev --port 3210` from `apps/web/` — note the `next` bin is hoisted to the **repo root** `node_modules` and the working directory must be `apps/web/`, otherwise Next fails with "Couldn't find any pages or app directory").
3. **Prevention:** any schema change in this repo implies a Prisma-client regeneration; plan for a brief dev-server restart. Do not try to swap the binary while the server is live.

---

### 12. Room-Type Web Bookings Had No Physical Room — Silent Check-In on a Null Room

**Problem/Risk:**
- Web bookings reserve by `roomTypeId` with `BookingRoom.roomId = null` until reception assigns a room. `checkIn` previously used `if (!room.roomId) continue;`, so it happily flipped the booking to `CHECKED_IN` while no room was marked `OCCUPIED` — the tape chart showed the room as free (double-booking risk) and assignment was never forced.

**Architectural Solution/Prevention Mechanism:**
1. `checkIn` now refuses the whole operation **before any mutation** if any `BookingRoom.roomId` is null (`ValidationError`), so a booking can never enter the checked-in state without physical rooms.
2. `assignPhysicalRoom` locks the target `Room` row (`FOR UPDATE`), validates hotel ownership, room status, room-type match, and date overlap against CONFIRMED/CHECKED_IN rows, writes an `ASSIGN_ROOM` audit entry, and promotes `PENDING → CONFIRMED` only when every row is assigned.
3. Reception UI surfaces «بانتظار تخصيص غرفة» and hides the check-in button until assignment completes; the unassigned rows are released automatically by the hourly expiry scan after `confirmationCutoffHours`.

---

## 📁 ملفات التخطيط (Todo Files)

| الملف | الوصف |
|-------|-------|
| `todos.md` | ملاحظات عامة (لا يُستخدم للمراحل الرئيسية) |
| `todo_v4.md` | المرحلة 4: الكمال التشغيلي — نقل غرفة، تمديد، إلغاء، مجموعات، Tape Chart (مكتمل ✅) |
| `todo_v5.md` | المرحلة 5: White-Label SaaS — customDomain + قفل الدخول + سياق العلامة + الدعوات (مكتمل ✅) |
| `todo_v6.md` | المرحلة 6: لوحة التحكم العليا — فنادق + دعوات + إعادة إرسال (مكتمل ✅) |
| `todo_v7.md` | المرحلة 7: بوابات الدفع متعددة المستأجرين — Sadad/MobiCash/Tadawul (مُستبدَلة في v8 ✅) |
| `todo_v8.md` | المرحلة 8: Decoupled PMS Ledger — حقن الحجوزات الخارجية + دفتر Ledger مفكوك (مكتمل ✅) |
| `todo_v9.md` | M3/M4: قفل الحصة الذرّي + تخصيص الغرفة الفيزيائية + الانتهاء التلقائي (مكتمل ✅) |

---

> **ملاحظة:** هذا المشروع يستخدم Prisma مع PostgreSQL. تأكد من تشغيل Docker قبل بدء التطوير.
