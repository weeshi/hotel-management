# وثيقة متطلبات المنتج والمواصفات المعمارية المعتمدة (Canonical Product Requirements Document — PRD)

- **اسم المنتج:** منصة إدارة الفنادق السحابية متعددة المستأجرين (Enterprise Multi-Tenant Cloud PMS)
- **الإصدار المرجعي:** `v9.x` (`v9.4` الحالي / `v9.5` المرحلة الخامسة)
- **المسار الجذري المعتمد:** `D:\ERP-Projects\hotel-management`
- **هيكلية المستودع:** Monorepo (`apps/web` + `packages/shared`)
- **حالة الوثيقة:** المصدر المرجعي الوحيد لمتطلبات المنتج والثوابت المعمارية (Single Source of Product Truth)

---

## الفهرس
1. [رؤية المنتج والنطاق المعماري (Product Vision & Architecture Scope)](#1-رؤية-المنتج-والنطاق-المعماري-product-vision--architecture-scope)
2. [مصفوفة الصلاحيات والتحكم بالوصول (Role-Based Access Matrix — RBAC)](#2-مصفوفة-الصلاحيات-والتحكم-بالوصول-role-based-access-matrix--rbac)
3. [الوحدات الأساسية والثوابت المعمارية (Core Product Modules & Invariants)](#3-الوحدات-الأساسية-والثوابت-المعمارية-core-product-modules--invariants)
   - [3.1 عزل المستأجرين (M8) والملاحظية (M9)](#31-عزل-المستأجرين-m8-والملاحظية-m9-multi-tenant-isolation--observability)
   - [3.2 محرك الحجز المركزي وحصة الحجز العام (M3/M4)](#32-محرك-الحجز-المركزي-وحصة-الحجز-العام-m3m4-booking-engine--public-quota)
   - [3.3 مدير القنوات وخزينة البطاقات الافتراضية PCI-DSS (M10)](#33-مدير-القنوات-وخزينة-البطاقات-الافتراضية-pci-dss-m10-channel-manager--vcc-vault)
   - [3.4 الدفتر المالي، الفواتير، نقاط البيع، المحافظ، والخزائن](#34-الدفتر-المالي-الفواتير-نقاط-البيع-المحافظ-والخزائن-financial-ledger--folios)
   - [3.5 التشغيل المتقدم — المرحلة الخامسة (Operations Pro — Phase 5)](#35-التشغيل-المتقدم--المرحلة-الخامسة-operations-pro--phase-5)
4. [بوابات التحقق الهندسية الإلزامية (Mandatory Verification Gates)](#4-بوابات-التحقق-الهندسية-الإلزامية-mandatory-verification-gates)

---

## 1. رؤية المنتج والنطاق المعماري (Product Vision & Architecture Scope)

### 1.1 الرؤية والغرض التشغيلي
توفر المنصة نظام إدارة فنادق سحابياً متكاملاً (`Multi-Tenant SaaS Cloud PMS`) يغطي دورة حياة الضيف والعمليات الفندقية والمحاسبية من البداية إلى النهاية: البحث والحجز المباشر عبر بوابة الفندق العامة، استقبال الحجوزات الفورية من وكالات السفر العالمية (`OTAs` مثل Booking.com وExpedia)، إدارة الاستقبال والتسكين والمخطط الزمني التفاعلي (`Tape Chart`)، تشغيل نقاط بيع المطعم (`POS`) والخزائن (`Safeboxes` & `SafeDepositBox`) والمحافظ النقدية (`Guest Wallet`)، التدبير الفندقي (`Housekeeping`) والصيانة (`Maintenance`) والمفقودات (`Lost & Found`)، وصولاً إلى الدفتر المالي المفكوك (`Decoupled Financial Ledger`) وتقارير المجموعات الموحدة (`Group Bookings`) والفوترة الشهرية الآجلة للشركات (`Corporate Billing`).

### 1.2 المكدس التقني المعتمد (Canonical Tech Stack)
| الطبقة | التقنية / الأداة | الدور المعماري |
|---|---|---|
| إطار العمل والواجهة | `Next.js 14` (App Router) + `React 18` + `Tailwind CSS` | واجهات متعددة الأدوار + مسارات API موحدة في `apps/web` |
| لغة البرمجة والأنماط | `TypeScript` (Strict Mode) + `Zod` | تنميط صارم بدون أي تجاوز (`no any / as any / as unknown`) في `apps/web` و`packages/shared` |
| طبقة البيانات ORM | `Prisma 6` + عميل متعدّد الأوضاع (`prisma`, `prismaPlatform`, `tenantTx`) | توجيه المعاملات وحقن `hotelId` عبر `AsyncLocalStorage` |
| قاعدة البيانات العلائقية | `PostgreSQL` مع `FORCE ROW LEVEL SECURITY` | **54 سياسة** `tenant_isolation`، **59 جدولاً** بـ `FORCE RLS`، و**19 تريجر/قيد** `ON DELETE RESTRICT ON UPDATE CASCADE` |
| الطوابير والعمليات الخلفية | `Redis` + `BullMQ` (`cm-*` queues + `cm-dlq`) | 8 طوابير غير متزامنة للمزامنة، الإلغاء التلقائي، تطهير VCC، والـ Webhooks |
| الملاحظية والسجلات | `pino` (`src/lib/observability/logger.ts`) | سجلات مهيكلة مرتبطة بسياق المستأجر مع حجب تلقائي للأسرار وبيانات البطاقات |

### 1.3 المبادئ الهندسية الحاكمة (Core Architectural Tenets)
1. **قاعدة البيانات هي الحارس الأخير (Database as Ultimate Gatekeeper):** العزل بين الفنادق مفروض في محرك PostgreSQL عبر `FORCE ROW LEVEL SECURITY` ومتغير الجلسة المحصور بالمعاملة `app.current_hotel_id`، بحالة فشل مغلقة (`Fail-Closed`).
2. **انعدام الثقة بالعميل (Zero Client Trust):** جميع الحسابات السعرية والضريبية والأرصدة وحصص الغرف تُحسم حصرياً على الخادم داخل معاملات ذرية (`tenantTx`).
3. **الدفتر المالي المفكوك (Decoupled PMS Ledger):** فصل حالة الحجز التشغيلية (`Booking`) عن الذمة المالية (`Folio` و`FolioTransaction`) وعن بوابات الدفع، مع سجل حركات غير قابل للحذف (الإلغاء يتم حصراً عبر `isVoided = true` وعكس الأثر المالي وتوثيقه في `AuditLog`).
4. **عزل بيانات البطاقات (Zero Raw PAN Exposure):** لا يلمس خادم التطبيق أرقام البطاقات الائتمانية الافتراضية (`VCC`) الخام؛ تتم التوكنة عبر خزينة `VGS` والكشف المؤقت داخل `iframe` معزول لمدة 60 ثانية فقط.

---

## 2. مصفوفة الصلاحيات والتحكم بالوصول (Role-Based Access Matrix — RBAC)

### 2.1 ضوابط الهوية والجلسات (Identity & Session Invariants)
- **عزل الجلسات:** تُخزَّن رموز المصادقة (`JWT`) في كوكيز `httpOnly; Secure; SameSite=Lax` محصورة بالنطاق (`Host-Only Cookies`). يُحظر على العميل قراءة الكوكيز مباشرةً؛ تُستمد حالة الجلسة من استجابات الـ API.
- **سلسلة الحماية الإلزامية للمسارات المغيّرة للحالة:** كل مسار `POST` / `PUT` / `PATCH` / `DELETE` يُغلَّف وجوباً بـ `withAuth(withCsrf(withRateLimit(handler)), allowedRoles)`.
- **حظر التسجيل الذاتي:** مسار `/api/auth/register` مغلق تماماً (`403 Forbidden`)؛ يتم تأسيس الفنادق وحسابات المدراء عبر نظام الدعوات الموقّعة (`Invitation`) الذي يديره `SUPER_ADMIN`.
- **عزل أدوار المنصة عن أدوار الفندق (1:1 Tenant Binding):** كل مستخدم فندقي يرتبط بفندق واحد فقط (`user.hotelId`) مستخرج من الـ `JWT` الموقّع (لا يُقبل `hotelId` من جسم الطلب أبداً). أما `SUPER_ADMIN` (`hotelId: null`) فيعمل على مسارات المنصة (`/superadmin/*`, `/api/superadmin/*`) مع إلزامية التحقق الثنائي (`2FA OTP`) ووضع الترقية المؤقتة (`Step-Up / Sudo Mode` عبر `StepUpModal`) للعمليات الحساسة.
- **منع تعداد الموارد عبر المستأجرين:** أي محاولة للوصول إلى سجل يتبع فندقاً آخر تُعيد `404 NotFoundError` (وليس `403`).

### 2.2 جدول القدرات التفصيلي للأدوار التسعة

| المجال / الصلاحية | `SUPER_ADMIN` | `ADMIN` | `MANAGER` | `RECEPTION` | `ACCOUNTANT` | `RESTAURANT` | `HOUSEKEEPING` | `MAINTENANCE` | `GUEST` |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| إدارة الفنادق، النطاقات (`customDomain`)، والدعوات (`Invitation`) | ✅ (2FA + Step-Up) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| مراقبة وإعادة جدولة طوابير `BullMQ` و`cm-dlq` (`/superadmin/jobs`) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| إعدادات الفندق، إعدادات الموقع (`WebsiteSetting`)، ومفاتيح التكامل (`IntegrationConfig` / `ApiKey`) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| إدارة حسابات الموظفين والأدوار داخل الفندق | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| إدارة أنواع الغرف (`RoomType`)، الغرف (`Room`)، خطط الأسعار (`RatePlan`)، وسياسات الإلغاء | ❌ | ✅ | ✅ | 👁️ (قراءة) | 👁️ (قراءة) | ❌ | ❌ | ❌ | 👁️ (المتاح للويب) |
| إدارة ربط مدير القنوات (`ChannelMapping`) ومزامنة المخزون | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| إنشاء الحجوزات، التعديل، النقل (`move-room`)، التمديد (`extend`)، وتخصيص الغرف (`assign-room`) | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (بوابة الحجز العام) |
| تسجيل الدخول (`checkIn`) وتسجيل الخروج (`checkOut` / `earlyCheckout`) | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| المخطط الزمني التفاعلي (`Tape Chart Pro`) والسحب والإفلات والطباعة | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| كشف بطاقة الائتمان الافتراضية (`VCCReveal` — 60s iframe) | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| عرض وإدارة الفواتير (`Folio`)، إضافة الرسوم والمدفوعات والخصومات | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| إلغاء الحركات المالية (`Void`) وإصدار المبالغ المستردة (`Refund`) | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| إدارة حجوزات المجموعات (`GroupBooking`) وقواعد التوجيه (`FolioRoutingRule`) | ❌ | ✅ | ✅ | ✅ | 👁️ (تقرير) | ❌ | ❌ | ❌ | ❌ |
| التقرير الموحد للمجموعات (`GET /api/admin/group-bookings/[id]/report`) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| الفوترة الشهرية للشركات (`ExternalClient` & Corporate `Invoice`) | ❌ | ✅ | ✅ | 👁️ (قراءة/ربط) | ✅ | ❌ | ❌ | ❌ | ❌ |
| إدارة محافظ النزلاء (`Wallet`)، الإيداع/السحب/التجميد، وإيصالات PDF | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| إدارة صناديق الأمانات والخزائن (`SafeDepositBox` & `SafeBox`) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| نقاط بيع المطعم (`Restaurant POS`)، الطلبات، والترحيل لفاتورة الغرفة | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| مهام التدبير الفندقي (`HousekeepingTask`) وتحديث حالة نظافة الغرف | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| مهام الصيانة (`MaintenanceTask`) وتحويل حالة الغرفة إلى `MAINTENANCE` | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| سجل التدقيق الأمني والمالي (`AuditLog`) | 👁️ (المنصة) | ✅ | ✅ | ❌ | 👁️ (مالي) | ❌ | ❌ | ❌ | ❌ |

---

## 3. الوحدات الأساسية والثوابت المعمارية (Core Product Modules & Invariants)

### 3.1 عزل المستأجرين (M8) والملاحظية (M9) (Multi-Tenant Isolation & Observability)

#### أ. دفاع الطبقات الأربع لعزل المستأجرين (M8 Defense-in-Depth)
1. **حسم السياق (`AsyncLocalStorage` في `src/lib/tenant/runtime-context.ts`):** كل طلب HTTP أو وظيفة طابور يحسم هوية المستأجر ويدخل في `runWithTenant({ mode: 'TENANT', hotelId })` أو `runWithTenant({ mode: 'PLATFORM' })`.
2. **حارس وقت الترجمة (`TenantTxClient`):** يلزم تمرير `hotelId` صريحاً في جميع عمليات الإنشاء للنماذج الـ 19 التابعة للفندق.
3. **وسيط Prisma وحقن المستأجر (`withHotelInjection` & `relay` في `src/lib/utils/prisma.ts`):**
   - دالة `tenantTx(fn)` تفتح معاملة قاعدة بيانات وتنفذ `SELECT set_config('app.current_hotel_id', $1, true)` محلياً للمعاملة (آمن مع `pgBouncer`).
   - الاستعلامات المفردة خارج `tenantTx` تحت وضع `TENANT` تُغلَّف تلقائياً بمعاملة قصيرة تضبط `app.current_hotel_id`.
   - أي محاولة كتابة بدون سياق (`undefined`) تُرفض فوراً عبر `assertMutationContext`.
4. **سياسات PostgreSQL (`FORCE ROW LEVEL SECURITY` + التريجرات الـ 19):**
   - اتصال التطبيق القياسي (`app_tenant`) لا يملك `BYPASSRLS`؛ غياب `app.current_hotel_id` يؤدي إلى `Fail-Closed` (صفر صفوف للقراءة ورفض للكتابة).
   - 19 تريجر دفاعي تتحقق من تطابق `hotelId` بين السجل الابن والسجل الأب قبل الإدراج أو التحديث، مع قيود `ON DELETE RESTRICT ON UPDATE CASCADE` التي تمنع حذف أي فندق يمتلك سجلات مالية أو تشغيلية.

#### ب. الملاحظية، السجلات المهيكلة، والطوابير (M9 Observability & Queues)
- **السجل المهيكل (`pino` في `src/lib/observability/logger.ts`):** يحقن `hotelId` تلقائياً في كل سطر سجل، ويطبق حجب مسارات صارماً (`redact`) على كلمات المرور، التوكنات، الترويسات الأمنية، وبيانات البطاقات (`password`, `token`, `authorization`, `cookie`, `vcc*`, `pan`, `cvv`). يُمنع استخدام `console.log` في كود الإنتاج.
- **مسارات الفحص الصحية:**
  * `GET /api/health`: فحص الحياة السريع (`Liveness`).
  * `GET /api/ready`: فحص الجاهزية العميق (`Readiness`)؛ يتحقق من اتصال PostgreSQL، اتصال Redis، حالة الطوابير، وتشغيل `runRlsCensus` للتثبت من فعالية الـ 54 سياسة و59 جدول `FORCE RLS` و19 تريجر.
- **منظومة طوابير `BullMQ` (`cm-*` + `cm-dlq`):**
  * تشمل الطوابير: `cm-snapshot`, `cm-publish`, `cm-ingest`, `cm-rates`, `cm-reconcile`, `cm-purge`, `cm-webhook-delivery`, وطابور الرسائل الميتة الموحد `cm-dlq`.
  * كل وظيفة تُنفَّذ عبر `withTenantJob` (التزام بتمرير `hotelId` أو وضع `PLATFORM` للماسحات المجدولة فقط)، مع إعادة محاولة أسّية (`Exponential Backoff + Jitter`) وترحيل الفشل النهائي إلى `cm-dlq`.

---

### 3.2 محرك الحجز المركزي وحصة الحجز العام (M3/M4: Booking Engine & Public Quota)

1. **معادلة التوفر الإلكتروني (`onlineAvailable`):**
   - يُحسب التوفر المعروض على بوابة الحجز العام لكل نوع غرفة (`RoomType` حيث `isWebVisible = true`) عبر المعادلة:
     $$\text{onlineAvailable} = \min\big(\max(0, \text{webRoomLimit} - \text{pendingReserved}), \text{physicalAvailable}\big)$$
   - حيث `physicalAvailable` هو عدد الغرف الفيزيائية غير الخاضعة للصيانة (`status !== 'MAINTENANCE'`) وغير المحجوزة بحجوزات `CONFIRMED` أو `CHECKED_IN` متقاطعة زمنياً، و`pendingReserved` هو عدد غرف حجوزات `WEBSITE` المعلقة (`PENDING`) المتقاطعة.
2. **القفل الذري للحصة ومنع البيع الزائد (M3 Atomic Quota Lock):**
   - داخل `BookingService.create` وضمن `tenantTx`، يتم قفل صف `RoomType` حصرياً قبل إنشاء الحجز:
     `SELECT id FROM "RoomType" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE`
   - يُعاد حساب `physicalAvailable` و`pendingReserved` داخل القفل؛ وإذا نفدت الحصة يُرمى `ConflictError` (`409`) لمنع سباقات التزاحم المتزامنة (`TOCTOU`).
3. **إلزامية تخصيص الغرفة الفيزيائية قبل الدخول (M4-A Physical Room Assignment & `checkIn` Guard):**
   - حجوزات الموقع (`WEBSITE`) ومدير القنوات (`PARTNER`) تُنشأ على مستوى نوع الغرفة (`BookingRoom.roomTypeId` مع `roomId = null`).
   - **حارس `checkIn` الصارم:** يرفض `BookingService.checkIn` أي حجز لا يزال يحتوي على صف `BookingRoom` فيه `roomId === null` ويرمي `ValidationError` (`422`) قبل إجراء أي تعديل في القاعدة.
   - **خدمة `assignPhysicalRoom` (`POST /api/admin/bookings/[id]/assign-room`):** تقفل صف `Room` بـ `FOR UPDATE`، وتتحقق من ملكية الفندق، تطابق `roomTypeId`، كون الغرفة `AVAILABLE`، وعدم وجود تعارض تواريخ، ثم تسند `roomId`، وتحول الحجز من `PENDING` إلى `CONFIRMED` عند اكتمال تخصيص جميع غرفه دون المساس برصيد الفاتورة (`Folio`)، مع تسجيل `ASSIGN_ROOM` في `AuditLog`.
4. **الانتهاء التلقائي للحجوزات الإلكترونية غير المؤكدة (M4-B Auto-Expiry):**
   - تعمل المهمة الساعية `hourly-web-booking-expiry` (`runWebBookingExpiryScan` على طابور `cm-reconcile`) بمسح الفنادق تحت سياق `PLATFORM` ثم الدخول في سياق `TENANT` لكل فندق.
   - كل حجز `PENDING` من مصدر `WEBSITE` تجاوز عمره `WebsiteSetting.confirmationCutoffHours` (افتراضياً 48 ساعة) ولا يملك أي دفعة `SUCCEEDED` يُحوَّل ذرياً إلى `CANCELLED`، وتُبطَل فاتورته الصفرية (`VOID`)، ويُدوَّن الحدث `AUTO_EXPIRE_WEB_BOOKING` في `AuditLog`.

---

### 3.3 مدير القنوات وخزينة البطاقات الافتراضية PCI-DSS (M10: Channel Manager & VCC Vault)

1. **مدير القنوات (`Channel Manager`):**
   - يدعم ربط أنواع الغرف وخطط الأسعار مع المنصات العالمية (`ChannelMapping`)، بناء لقطات الأسعار والتوفر (`ChannelPriceSnapshot`)، ودفع التحديثات عبر طوابير `cm-snapshot` و`cm-publish` و`cm-rates`.
   - استقبال الحجوزات الواردة (`ingestInbound`) يضمن عدم التكرار (`Idempotency`) عبر `externalRef`، وينشئ الحجز والفاتورة داخل `tenantTx` مع إبقاء `roomId = null` لحين التخصيص.
2. **تطبيع وتوكنة البطاقات الائتمانية الافتراضية (M10 W1–W2):**
   - تمر حجوزات القنوات المزودة ببطاقات افتراضية (`VCC`) عبر مسار بروكسي VGS (`/api/external/channel/vgs/[provider]/bookings`) حيث تُستبدل البيانات الحساسة بتوكنات خزينة VGS (`vccNumberToken`, `vccExpiryToken`, `vccCvcToken`) وتُحفظ في جدول `Payment` دون تخزين أي أرقام خام.
3. **الكشف الآمن المؤقت (M10 W3 — `VCCReveal.tsx`):**
   - يستدعي موظفو `ADMIN` / `MANAGER` / `RECEPTION` المسار `GET /api/admin/bookings/[id]/vcc-tokens` الذي يتحقق من ملكية الفندق ويسجل فوراً قيد تدقيق `action: 'revealed'` في `VCCAuditLog`.
   - يعرض المكون `VCCReveal.tsx` البيانات داخل `iframe` معزول لمدة **60 ثانية** فقط ثم يُخفيها ويُتلف الحالة المحلية تلقائياً.
4. **التطهير اليومي الآلي لتوكنات VCC (M10 W4 — `purgeVCC.job.ts`):**
   - تعمل مهمة `daily-vcc-purge-scan` يومياً عند الساعة **`03:00 Africa/Tripoli`** على طابور `cm-purge` في وضع `PLATFORM` لرصد الحجوزات التي مضى على مغادرتها (`CHECKED_OUT`) أو إلغائها (`CANCELLED`) **7 أيام فأكثر** ولا تزال تحتفظ بتوكنات VCC.
   - تطلق لكل دفعة وظيفة `purge-vcc` مقيدة بـ `hotelId` تحت سياق `TENANT`، فتحذف التوكنات من VGS Vault API (مع اعتبار `404` نجاحاً متكرراً آمناً)، وتصفّر حقول التوكنات في `Payment`، وتختم `vccPurgedAt`، وتسجل `action: 'purged'` في `VCCAuditLog`.

---

### 3.4 الدفتر المالي، الفواتير، نقاط البيع، المحافظ، والخزائن (Financial Ledger & Folios)

1. **الثابت الرياضي للدفتر المالي (`Folio Mathematical Invariant`):**
   - تخضع كل فاتورة (`Folio`) في كل لحظة للمعادلة الصارمة:
     $$\text{balance} = \text{round2}(\text{totalCharges} - \text{totalPaid})$$
   - `totalCharges`: مجموع حركات `CHARGE` ناقص حركات `DISCOUNT` غير الملغاة (`isVoided = false`).
   - `totalPaid`: مجموع المدفوعات الناجحة (`SUCCEEDED`) صافيةً من المبالغ المستردة (`refundedAmount`).
2. **حارس التسوية المالية عند المغادرة (`Checkout Finance Guard`):**
   - يُمنع انتقال أي حجز إلى `CHECKED_OUT` ما لم يكن رصيد فاتورته `balance === 0`، وعندها تتحول الفاتورة تلقائياً إلى `SETTLED` وتتحول الغرف إلى `AVAILABLE` + `DIRTY` مع إنشاء مهام تنظيف.
3. **توجيه رسوم المجموعات (`Master/Sub-Folio Routing`):**
   - تمتلك كل مجموعة (`GroupBooking`) فاتورة رئيسية (`masterFolio`) وقواعد توجيه (`FolioRoutingRule`) تحدد الفئات (`ROOM_CHARGE`, `SERVICE`, `RESTAURANT`, إلخ) التي تُرحَّل تلقائياً إلى `masterFolio` بدلاً من الفاتورة الفرعية للنزيل (`Sub-Folio`).
4. **نقاط بيع المطعم (`Restaurant POS`)، محفظة النزيل (`Wallet`)، والخزائن (`SafeDepositBox`):**
   - **المطعم (`POS`):** يتيح تسوية الطلبات نقداً/بطاقة/محفظة أو ترحيلها إلى فاتورة الغرفة مع احترام قواعد التوجيه.
   - **محفظة النزيل (`Wallet`):** تدعم الإيداع (`DEPOSIT`)، السحب (`WITHDRAWAL`)، تسوية فواتير الإقامة والمطعم (`PAYMENT`)، التجميد، وإصدار إيصالات PDF رسمية، مع ضمان استمرارية رصيد الدفتر (`balanceBefore` / `balanceAfter`).
   - **صناديق الأمانات والخزائن (`SafeDepositBox` & `SafeBox`):** تدعم الملكية متعددة الأشكال (`Polymorphic`: إما مرتبطة بحجز نزيل `bookingId` أو بعميل خارجي `externalClientId`) مع باقات تسعير (`SafeBoxPackage`) وترحيل الرسوم للفاتورة.

---

### 3.5 التشغيل المتقدم — المرحلة الخامسة (Operations Pro — Phase 5)

#### 1. المخطط الزمني التفاعلي المتقدم (`Tape Chart Pro` — `v9.3`)
- المسار: `GET /api/admin/tape-chart` والواجهة `/reception/tape-chart`.
- يدعم الفلترة الفورية بالبحث النصي (`q` في اسم الضيف أو رقم الحجز)، نوع الغرفة (`roomTypeId`)، الطابق (`floor`)، والحالة (`status`).
- **قائمة الحجوزات بانتظار التخصيص (`unassignedBookings` Lane):** تعرض جميع صفوف `BookingRoom` التي تحمل `roomId = null` لحجوزات `CONFIRMED` أو `PENDING` متقاطعة مع النافذة الزمنية، مع دعم التخصيص بالنقر (`AssignRoomModal`) أو **بالسحب والإفلات المباشر** على شبكة الغرف (`POST /api/admin/bookings/[id]/assign-room`).
- **عرض الطباعة (`Print View`):** زر طباعة يستدعي `window.print()` مدعوماً بقواعد `@media print` بوضع أفقي (`landscape`) يعزل شبكة المخطط الزمني ويخفي أشرطة التحكم.

#### 2. التقارير الموحدة لحجوزات المجموعات (`Group Booking Consolidated Reports` — `v9.4`)
- الخدمة: `GroupBookingService.getGroupReport(groupId, hotelId)` عبر المسار `GET /api/admin/group-bookings/[id]/report` للأدوار `ADMIN`, `MANAGER`, `RECEPTION`, `ACCOUNTANT`.
- **ملخص الإشغال (`occupancySummary`):** إجمالي الحجوزات النشطة (باستثناء `CANCELLED`)، الحجوزات الملغاة، توزيع الحالات (`statusBreakdown`)، إجمالي الغرف، الغرف المخصصة مقابل غير المخصصة (`roomId === null`)، مجموع ليالي الغرف (`totalRoomNights`)، وإجمالي الضيوف (`adults`, `children`).
- **الملخص المالي الموحد (`financialSummary`):** ملخص الفاتورة الرئيسية (`masterFolio`)، إجماليات الفواتير الفرعية النشطة (`subFoliosTotals` مع استثناء الفواتير الملغاة `VOID` الصفرية)، الإجماليات الموحدة (`consolidatedTotals`)، تفصيل الرسوم حسب الفئة (`chargesByCategory`) وتفصيل المدفوعات الصافية حسب الطريقة (`paymentsByMethod`) مقسّمة إلى `masterAmount` و`subFoliosAmount` و`totalAmount`.
- **الواجهة (`GroupReportModal.tsx`):** نافذة تقرير شاملة قابلة للطباعة (`data-print-root` / `data-print-hide`) مرتبطة ببطاقة المجموعة (`GroupBookingCard.tsx`).

#### 3. أتمتة الفوترة الشهرية للشركات (`Corporate Monthly Billing` — `ExternalClient` & `Invoice` — `v9.5`) ✅
- **النموذج المعماري:** يرتبط العميل الخارجي / الشركة (`ExternalClient`) بفواتير مؤسسية (`Invoice`) تحمل رقماً تسلسلياً فريداً `CORP-YYYYMM-XXXX` (شهر الفترة `periodEnd` بتوقيت UTC) وتمر بدورة حياة محكومة (`DRAFT` $\rightarrow$ `ISSUED` $\rightarrow$ `PAID` أو `VOID`). الحقول المضافة: `status`, `periodStart`, `periodEnd`, `dueDate`, `paidAt`, `subtotal` (Decimal), `taxAmount` (Decimal), `paidAmount` (Decimal), `notes`, `items` (Json snapshot), `updatedAt`.
- **توليد الكشف الشهري (`generateMonthlyStatement`):**
  * المسار: `POST /api/admin/external-clients/[id]/invoices` (ADMIN/MANAGER/ACCOUNTANT + CSRF).
  * يجمع آلياً البنود غير المفوترة خلال `[periodStart, periodEnd]` من فواتير/رسوم الحجوزات المرتبطة بالشركة (عبر `GroupBooking.companyName` أو صناديق الأمانات المرتبطة بـ `externalClientId`)، مع **استثناء أي فاتورة فرعية سبق ترحيلها على فاتورة مؤسسية غير `VOID`** (يُستدل عليها من `Invoice.folioId` أو لقطة `items[].folioId`).
  * يدعم بنوداً صريحة `lineItems[]` (بنود عقد/خدمات مختارة) تكون مرجعية عند تمريرها.
  * يحسب `subtotal`، `taxAmount` (وفق `taxRate`)، و`total`، ويحدد `dueDate`، وينشئ الفاتورة بحالة `ISSUED` داخل `tenantTx` مع تدوين `CREATE_CORPORATE_INVOICE` في `AuditLog`.
- **تسجيل الدفعات وتتبع أعمار الديون (`recordInvoicePayment` & Aging):**
  * المسار: `POST /api/admin/external-clients/[id]/invoices/[invoiceId]/pay` (ADMIN/MANAGER/ACCOUNTANT + CSRF).
  * يقفل صف الفاتورة بـ `FOR UPDATE` داخل `tenantTx`، ويحدث `paidAmount` (سداد جزئي أو كلي)، ويحول الفاتورة تلقائياً إلى `PAID` مع ختم `paidAt` عند اكتمال السداد (`paidAmount >= total`)، ويرفض السداد الزائد وعلى الفواتير المسددة (`PAID`) أو الملغاة (`VOID`)، ويسجل `PAY_CORPORATE_INVOICE` في `AuditLog`.
- **كشف الحساب (`getClientStatement`):** المسار `GET /api/admin/external-clients/[id]/invoices` يعيد بيانات العميل، ومؤشرات `totalInvoiced`, `totalPaid`, `outstandingBalance`, و`overdueBalance` (حيث `dueDate < now` والحالة `ISSUED`)، وقائمة الفواتير.
- **الثوابت:** `CORPORATE_INVOICE_STATUSES = ['DRAFT','ISSUED','PAID','VOID']` مع تحقق `z.nativeEnum` لحقل طريقة الدفع (`PaymentMethod`) — صفر `any`.

#### 4. مؤشرات الأداء التنفيذية والتنبيهات (`Executive KPIs & Alerts`)
- لوحة قيادة تنفيذية تعرض نسبة الإشغال (`Occupancy Rate`)، متوسط السعر اليومي (`ADR`)، العائد لكل غرفة متاحة (`RevPAR`)، توزيع الإيرادات حسب القسم، والتنبيهات التشغيلية الفورية.

---

## 4. بوابات التحقق الهندسية الإلزامية (Mandatory Verification Gates)

يُحظر دمج أي طلب سحب (`Pull Request`) في الفرع الرئيسي `master` قبل استيفاء البوابات التالية دون استثناء:
1. **فحص الأنواع الصارم:** `npx tsc --noEmit` (صفر أخطاء، مع حظر `any` و`as any` و`as unknown` و`@ts-ignore`).
2. **فحص جودة الكود:** `npx next lint` (صفر أخطاء ESLint).
3. **حصر سياسات العزل:** `npm run verify:rls` (التحقق من 54 سياسة `tenant_isolation` و59 جدول `FORCE RLS` و19 تريجر).
4. **اختبارات الوحدة والتكامل:** `npx vitest run` على قاعدة بيانات `hotel_test` الحقيقية بنسبة نجاح 100% (مع التأكد من تنظيف أي عمليات `vitest` يتيمة قبل التشغيل).
5. **المزامنة الفورية للتوثيق الحي:** تحديث `README.md` وملف المهام المرحلي (`todo_v*.md`) ووثيقة `docs/PRD.md` عند أي تغيير في المخطط أو المسارات أو الثوابت الوظيفية.
