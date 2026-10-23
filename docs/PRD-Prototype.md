markdown
# وثيقة متطلبات المنتج والمواصفات المعمارية الشاملة (Master PRD & Technical Specification)

- **اسم المنتج:** منصة إدارة الفنادق السحابية متعددة المستأجرين (Enterprise Multi-Tenant Cloud PMS)
- **الإصدار المرجعي للوثيقة:** v9.5 (Enterprise SaaS Edition)
- **المسار الجذري المعتمد:** `D:\ERP-Projects\hotel-management`
- **هيكلية المستودع:** Monorepo (`apps/web` + `packages/shared`)
- **حالة الوثيقة:** المرجع الوظيفي والتقني الأعلى (Single Source of Product & Architectural Truth)

---

## الفهرس التنفيذي
1. [الرؤية الاستراتيجية وأهداف النظام](#1-الرؤية-الاستراتيجية-وأهداف-النظام)
2. [الخريطة الهيكلية ومعمارية عزل المستأجرين (Multi-Tenant Isolation Architecture)](#2-الخريطة-الهيكلية-ومعمارية-عزل-المستأجرين-multi-tenant-isolation-architecture)
3. [الأدوار، الهويات، ومصفوفة الصلاحيات الشاملة (Identity & RBAC Matrix)](#3-الأدوار-الهويات-ومصفوفة-الصلاحيات-الشاملة-identity--rbac-matrix)
4. [إدارة الغرف، المخزون، ومحرك التسعير الديناميكي (Rooms, Inventory & Dynamic Pricing)](#4-إدارة-الغرف-المخزون-ومحرك-التسعير-الديناميكي-rooms-inventory--dynamic-pricing)
5. [محرك الحجز المركزي وبوابة الحجز العام (Central Booking Engine & Public Portal)](#5-محرك-الحجز-المركزي-وبوابة-الحجز-العام-central-booking-engine--public-portal)
6. [لوحة تحكم الموظفين والعمليات الفندقية (Staff Dashboard & Front-Desk Operations)](#6-لوحة-تحكم-الموظفين-والعمليات-الفندقية-staff-dashboard--front-desk-operations)
7. [الدفتر المالي المفكوك، الفواتير، والمحافظ (Decoupled Financial Ledger, Folios & Wallets)](#7-الدفتر-المالي-المفكوك-الفواتير-والمحافظ-decoupled-financial-ledger-folios--wallets)
8. [حجوزات المجموعات والفوترة الشهرية للشركات (Group Bookings & Corporate Billing)](#8-حجوزات-المجموعات-والفوترة-الشهرية-للشركات-group-bookings--corporate-billing)
9. [مدير القنوات العالمي، بوابات الدفع، وامتثال PCI-DSS/VCC](#9-مدير-القنوات-العالمي-بوابات-الدفع-وامتثال-pci-dssvcc)
10. [البنية غير المتزامنة، الملاحظية، ومعايير القبول غير الوظيفية (NFRs & Verification Gates)](#10-البنية-غير-المتزامنة-الملاحظية-ومعايير-القبول-غير-الوظيفية-nfrs--verification-gates)

---

## 1. الرؤية الاستراتيجية وأهداف النظام

### 1.1 بيان المشكلة والغرض (Problem Statement & Purpose)
تحتاج الفنادق والمنتجعات والشقق الفندقية إلى نظام سحابي موحد يدير دورة حياة النزيل بالكامل منذ لحظة البحث والحجز عبر الإنترنت أو عبر وكالات السفر العالمية (OTAs مثل Booking.com و Expedia)، مروراً بتخصيص الغرف وتسجيل الدخول والخدمات اليومية (المطعم، الخزائن، النظافة، الصيانة)، ووصولاً إلى التسوية المالية المحاسبية الدقيقة وفوترة الشركات والمجموعات.
صُممت هذه المنصة لتعمل بنموذج **SaaS متعدد المستأجرين (Multi-Tenant)** يشترك في نفس البنية التحتية الحاسوبية وقاعدة البيانات لتقليل تكاليف التشغيل، مع فرض **عزل تشفيري وقواعدي صارم (Zero-Trust Data Isolation)** يستحيل معه تسرب أي سجل أو معاملة مالية بين فندق وآخر.

### 1.2 المبادئ الهندسية الحاكمة (Core Architectural Tenets)
1. **قاعدة البيانات هي السلطة النهائية (Database as the Ultimate Authority):** لا يعتمد النظام على فلاتر الواجهة أو شروط `WHERE` البرمجية وحدها؛ بل يفرض سياسات `FORCE ROW LEVEL SECURITY` في PostgreSQL.
2. **انعدام الثقة بالعميل (Zero Client Trust):** جميع الأسعار، الضرائب، الخصومات، والأرصدة تُحسب حصرياً على الخادم داخل معاملات ذرية (`tenantTx`).
3. **الدفتر المالي المفكوك (Decoupled PMS Ledger):** فصل حالة الحجز التشغيلية (`Booking`) عن الذمة المالية (`Folio` و `FolioTransaction`)، مما يسمح بتعدد الفواتير، توجيه الرسوم للمجموعات، والفوترة الآجلة للشركات.
4. **أمان الدفع وعدم لمس بيانات البطاقات (Zero Raw Card Data):** يتم التعامل مع البطاقات الائتمانية الافتراضية (VCC) عبر خزينة VGS المعزولة، ومع بوابات الدفع المحلية (Plutu, T-Lync) عبر توقيعات Webhook الموثقة بـ HMAC.

---

## 2. الخريطة الهيكلية ومعمارية عزل المستأجرين (Multi-Tenant Isolation Architecture)

### 2.1 نموذج تعدد المستأجرين (Shared Database, Shared Schema, Enforced RLS)
تتشارك جميع الفنادق (Tenants) نفس مخطط قاعدة البيانات (`public` schema في PostgreSQL)، ويتم تمييز ملكية البيانات عبر مفتاح المستأجر `hotelId` المحمي على أربع طبقات متتالية:


```

┌────────────────────────────────────────────────────────────────────────────┐
│ Layer 1: Edge & Request Resolution (Host / Subdomain / JWT / API Key)      │
│   Resolves tenant identity → enters AsyncLocalStorage (TenantContext)      │
├────────────────────────────────────────────────────────────────────────────┤
│ Layer 2: Compile-Time Guard (TenantTxClient in TypeScript)                 │
│   Forces explicit `hotelId` on all 19 hotel-scoped models at build time    │
├────────────────────────────────────────────────────────────────────────────┤
│ Layer 3: Runtime Prisma Proxy & Interceptor (`withHotelInjection` & relay) │
│   Opens interactive transaction, runs `set_config('app.current_hotel_id')` │
│   and auto-stamps `hotelId` on top-level and nested creates                │
├────────────────────────────────────────────────────────────────────────────┤
│ Layer 4: PostgreSQL Engine (`FORCE ROW LEVEL SECURITY` + Triggers)         │
│   54 tenant_isolation policies + 19 RESTRICT foreign keys.                 │
│   Missing/mismatched GUC → Fail-Closed (0 rows read / permission denied)   │
└────────────────────────────────────────────────────────────────────────────┘

```

### 2.2 محركات الاتصال الثلاثة في طبقة البيانات (`src/lib/utils/prisma.ts`)
1. **`prismaBase` (اتصال `app_tenant` المقيد):**
   - يخضع بالكامل لسياسات `FORCE RLS`.
   - لا يملك صلاحية `BYPASSRLS`.
   - إذا نفذ أي استعلام دون ضبط المتغير `app.current_hotel_id`، تعيد قاعدة البيانات صفر صفوف تلقائياً (Fail-Closed).
2. **`prismaPlatform` (اتصال `app_platform` الإداري):**
   - يملك صلاحية `BYPASSRLS` ومخصص حصرياً لعمليات المنصة العليا (`SUPER_ADMIN`، التحقق من النطاقات عند الإقلاع، البحث عن الفنادق، الدعوات، والماسحات المجدولة العابرة للفنادق).
3. **`prisma` (العميل الموحد الموجه بـ `AsyncLocalStorage`):**
   - يقرأ السياق الحالي من `getTenantContext()` في `src/lib/tenant/runtime-context.ts`:
     * **`mode: 'TENANT'` (داخل `tenantTx`):** ينضم مباشرة إلى المعاملة النشطة التي تم ضبط `app.current_hotel_id` في بدايتها.
     * **`mode: 'TENANT'` (استعلام مفرد خارج `tenantTx`):** يفتح معاملة قصيرة، يضبط `set_config('app.current_hotel_id', ctx.hotelId, true)` (محلياً للمعاملة وآمن مع `pgBouncer`)، وينفذ الاستعلام.
     * **`mode: 'PLATFORM'`:** يوجه العملية إلى `prismaPlatform`.
     * **بدون سياق (`undefined`):** يمنع أي عملية كتابة فوراً عبر حارس `assertMutationContext` (يرمي خطأ برمجياً صاخباً)، ويترك القراءات تفشل بأمان (صفر صفوف).

### 2.3 آلية تحديد الفندق (Tenant Resolution Strategy)
يتم استنتاج الفندق المستهدف حسب نوع القناة:
1. **لوحة تحكم موظفي الفندق (`/api/admin/*`):** يُستخرج `hotelId` حصرياً من حمولة توكن المصادقة الموقّع (`JWT Access Token` المخزن في كوكي `httpOnly`) ولا يُقبل أبداً من جسم الطلب (Request Body) لمنع انتحال المستأجر.
2. **بوابة الحجز العام (`/api/public/*` و صفحات `(public)`):** يُحسم الفندق عبر ترويسة النطاق (`Host` header) بمطابقة النطاق المخصص للفندق (`Hotel.customDomain`) أو النطاق الفرعي (`Hotel.slug`) عبر استعلام ابتدائي محكم على `prismaPlatform`، ثم يُحبس باقي الطلب داخل `runWithTenant({ mode: 'TENANT', hotelId })`.
3. **التكاملات الخارجية والـ Webhooks (`/api/external/*`):** يُحسم الفندق عبر مفتاح الـ API المشفر (`ApiKey.keyHash`) أو عبر معرّف التكامل (`IntegrationConfig`) وتوقيع الـ Webhook، ثم يتحول التنفيذ فوراً إلى سياق `TENANT`.
4. **وظائف الطوابير الخلفية (`BullMQ Workers`):** كل معالج وظيفة مغلف بـ `withTenantJob`؛ إذا كانت حمولة الوظيفة تحتوي على `job.data.hotelId` تعمل في وضع `TENANT` الصارم، وإذا كانت وظيفة كرون شاملة (مثل الماسح اليومي) تعمل في وضع `PLATFORM` للمسح فقط ثم تطلق وظائف فرعية مقيدة بـ `hotelId`.

### 2.4 سياسة عدم حذف الفندق (Non-Deletable Hotel FK Invariant)
جميع الجداول المالية والتشغيلية الـ 19 المرتبطة بـ `Hotel` (بما فيها `Booking`, `Folio`, `FolioTransaction`, `Payment`, `Invoice`, `Refund`, `Wallet`, `WalletTransaction`, `BookingRoom`, `VCCAuditLog`) تخضع لقيد مفتاح أجنبي صارم:
`ON DELETE RESTRICT ON UPDATE CASCADE`
يُحظر الحذف الفيزيائي لأي فندق يحتوي على سجلات، ويُستعاض عنه بالتعطيل المنطقي (`Hotel.isActive = false`).

---

## 3. الأدوار، الهويات، ومصفوفة الصلاحيات الشاملة (Identity & RBAC Matrix)

### 3.1 هندسة المصادقة والجلسات (Authentication & Session Security)
- **تخزين الجلسة:** يُمنع استخدام `localStorage` أو `sessionStorage` لتخزين التوكنات. تُحفظ التوكنات في كوكيز `httpOnly; Secure; SameSite=Lax`.
- **حماية التعديل (CSRF):** كل طلب مغيّر للحالة (`POST`, `PUT`, `PATCH`, `DELETE`) يتطلب مطابقة ترويسة `x-csrf-token` مع كوكي CSRF (`withCsrf`).
- **حظر التسجيل الذاتي:** مسار `/api/auth/register` مغلق تماماً (`403 Forbidden`). يتم إنشاء الفنادق ومدرائها حصرياً عبر نظام الدعوات الموقّعة (`Invitation` token) الذي يديره `SUPER_ADMIN`.
- **مصادقة مالك المنصة (`SUPER_ADMIN` 2FA & Step-Up):**
  * تسجيل دخول `SUPER_ADMIN` يتطلب كلمة مرور + رمز تحقق ثنائي (`OTP`) يُرسل للبريد مع فترة تهدئة لإعادة الإرسال (`cooldown`).
  * العمليات الحساسة (تعديل مفاتيح البوابات، تدوير الأسرار، تعطيل الفنادق) تتطلب تفعيل وضع `Sudo / Step-Up` عبر رمز تحقق إضافي قصير العمر (`StepUpModal`).

### 3.2 مصفوفة الصلاحيات التفصيلية (RBAC Matrix)

| الوحدة / العملية | `SUPER_ADMIN` | `ADMIN` | `MANAGER` | `RECEPTION` | `ACCOUNTANT` | `RESTAURANT` | `HOUSEKEEPING` | `MAINTENANCE` | `GUEST` |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| إنشاء فندق / إدارة النطاقات / الدعوات | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| مراقبة طوابير BullMQ (`/superadmin/jobs`) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| إعدادات الفندق والموقع ومفاتيح API | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| إدارة المستخدمين والأدوار داخل الفندق | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| إدارة أنواع الغرف، الغرف، وخطط الأسعار | ❌ | ✅ | ✅ | 👁️ (قراءة) | 👁️ (قراءة) | ❌ | ❌ | ❌ | 👁️ (العام) |
| إنشاء وتأكيد الحجوزات وتخصيص الغرف | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (حجز عام) |
| تسجيل الدخول (`Check-In`) والخروج (`Check-Out`) | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| المخطط الزمني (`Tape Chart`) والنقل والتمديد | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| كشف بطاقة الائتمان الافتراضية (`VCC Reveal`) | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| إدارة الفواتير (`Folio`) والمدفوعات والخصومات | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| إلغاء القيود (`Void`) والاسترداد (`Refund`) | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| تقارير المجموعات والفوترة الشهرية للشركات | ❌ | ✅ | ✅ | 👁️ (مجموعات) | ✅ | ❌ | ❌ | ❌ | ❌ |
| إدارة محافظ النزلاء (`Wallet`) والخزائن | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| نقاط بيع المطعم (`POS`) وترحيل الطلبات للغرف | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| مهام النظافة وتحديث حالة نظافة الغرف | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| بلاغات الصيانة وتحويل الغرف لـ `MAINTENANCE` | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## 4. إدارة الغرف، المخزون، ومحرك التسعير الديناميكي (Rooms, Inventory & Dynamic Pricing)

### 4.1 الكيانات الأساسية
- **نوع الغرفة (`RoomType`):** يحدد السعة (`capacity`)، السعر الأساسي (`baseRate`)، الظهور في الموقع العام (`isWebVisible`)، والحد الأقصى لحصة البيع عبر الإنترنت (`webRoomLimit`)، مع المرافق (`RoomTypeAmenity`)، الخدمات الافتراضية (`RoomTypeDefaultService`)، والأسرة الإضافية (`RoomTypeExtraBed`).
- **الغرفة الفيزيائية (`Room`):** ترتبط بـ `RoomType`، وتحمل رقم الغرفة الفريد داخل الفندق (`@@unique([hotelId, roomNumber])`)، الطابق (`floor`)، الحالة التشغيلية (`status`: `AVAILABLE`, `OCCUPIED`, `MAINTENANCE`)، وحالة النظافة (`housekeepingStatus`: `CLEAN`, `DIRTY`, `INSPECTED`).
- **خطط الأسعار (`RatePlan`):** تدعم التسعير الموسمي، تسعير أيام الأسبوع مقابل عطلة نهاية الأسبوع، والوجبات المشمولة، وترتبط بسياسات الإلغاء (`CancellationPolicy`).

### 4.2 قصص المستخدمين ومعايير القبول (User Stories & Acceptance Criteria)

#### US-4.1: إعداد أنواع الغرف وتحديد سقف البيع الإلكتروني (`webRoomLimit`)
- **بصفتي:** مدير فندق (`ADMIN` / `MANAGER`).
- **أريد:** تحديد عدد أقصى للغرف المسموح بيعها عبر الموقع الإلكتروني (`webRoomLimit`) لكل نوع غرفة.
- **لأجل:** الاحتفاظ بعدد من الغرف الفيزيائية للحجوزات المباشرة (Walk-in) أو للشركات دون مخاطرة ببيع كامل الفندق إلكترونياً.
- **معايير القبول (Acceptance Criteria):**
  1. **Given** نوع غرفة يمتلك 10 غرف فيزيائية صالحة (`status !== 'MAINTENANCE'`) وتم ضبط `webRoomLimit = 4`.
  2. **When** يستعلم محرك الحجز العام عن التوفر في فترة زمنية خالية من الحجوزات.
  3. **Then** يجب أن يعيد النظام `onlineAvailable = 4` (وليس 10).
  4. **Given** تم حجز 3 غرف فعلية عبر الاستقبال (`CONFIRMED`) ويبقى 7 غرف فيزيائية، وهناك حجزان معلقان عبر الموقع (`PENDING` `WEBSITE`).
  5. **When** يُحسب التوفر الإلكتروني عبر المعادلة: `min(max(0, webRoomLimit - pendingReserved), physicalAvailable)`.
  6. **Then** تكون النتيجة `min(4 - 2, 7) = 2` غرف متاحة فقط على الموقع.

#### US-4.2: التسعير الديناميكي وحساب تكلفة الإقامة (`PricingService`)
- **بصفتي:** موظف استقبال أو نزيل يحجز عبر الموقع.
- **أريد:** أن يحسب النظام سعر كل ليلة تلقائياً بناءً على خطة السعر النشطة (`RatePlan`) أو السعر الأساسي لنوع الغرفة مع احتساب الأسرة الإضافية والخدمات الافتراضية.
- **معايير القبول:**
  1. **Given** حجز يمتد من `2026-11-01` إلى `2026-11-04` (3 ليالٍ).
  2. **When** توجد خطة سعر نشطة تغطي هذه الفترة لمستأجر الفندق.
  3. **Then** يطبق النظام سعر الخطة لكل ليلة، ويُنشئ قيود `ROOM_CHARGE` في الفاتورة بقيم عشرية دقيقة (`Prisma.Decimal` مقربة إلى منزلتين عشريتين).

---

## 5. محرك الحجز المركزي وبوابة الحجز العام (Central Booking Engine & Public Portal)

### 5.1 دورة حياة الحجز (`Booking Status State Machine`)
- الحالات المعتمدة: `PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `CHECKED_IN` $\rightarrow$ `CHECKED_OUT`، أو الانتقال من `PENDING`/`CONFIRMED` إلى `CANCELLED` / `NO_SHOW`.
- **الفرق الجوهري بين حجز الاستقبال وحجز الويب/OTA:**
  * حجز الاستقبال (`source: 'RECEPTION'`): يُسند إلى غرفة فيزيائية محددة (`roomId !== null`) ويُؤكد فوراً (`CONFIRMED`).
  * حجز الموقع الإلكتروني (`source: 'WEBSITE'`) وحجز مدير القنوات (`source: 'PARTNER'`): يُحجز على مستوى **نوع الغرفة** (`roomTypeId !== null` و `roomId: null`)، ويظل بانتظار تخصيص رقم الغرفة الفيزيائية من قِبل الاستقبال قبل تسجيل الدخول.

### 5.2 قصص المستخدمين ومعايير القبول (M3/M4 Public Booking)

#### US-5.1: منع البيع الزائد عند التزاحم المتزامن (M3 Atomic Quota Lock)
- **بصفتي:** نزيل يحجز عبر بوابة الفندق الإلكترونية.
- **أريد:** ضمان عدم قبول حجزين في نفس اللحظة على آخر غرفة متاحة في حصة الموقع.
- **لأجل:** منع ظاهرة البيع الزائد (Overselling / TOCTOU Race Condition).
- **معايير القبول:**
  1. **Given** نوع غرفة متبقٍ فيه غرفة واحدة فقط ضمن حصة الموقع (`onlineAvailable = 1`).
  2. **When** يرسل ضيفان طلبي `POST /api/public/bookings` في نفس الجزء من الثانية (`Promise.all`).
  3. **Then** تقوم دالة `BookingService.create` داخل `tenantTx` بتنفيذ قفل صف حصري:
     `SELECT id FROM "RoomType" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE`
     ثم تعيد حساب `physicalAvailable` و`pendingReserved` داخل نفس المعاملة، فينجح الطلب الأول (`201 Created`) ويرفض الطلب الثاني فوراً بكود `409 ConflictError` ورسالة `"لا توجد غرف متاحة من هذا النوع في التواريخ المحددة"`.

#### US-5.2: الإلغاء التلقائي للحجوزات الإلكترونية غير المؤكدة بعد انتهاء المهلة (M4 Auto-Expiry)
- **بصفتي:** مدير فندق.
- **أريد:** إلغاء الحجوزات الإلكترونية المعلقة (`PENDING`) التي لم يُسدد أصحابها قيمتها خلال المهلة المحددة في إعدادات الموقع (`WebsiteSetting.confirmationCutoffHours`، افتراضياً 48 ساعة).
- **لأجل:** تحرير الغرف المحجوزة وهمياً وإعادتها للبيع تلقائياً.
- **معايير القبول:**
  1. **Given** فندق ضبط `confirmationCutoffHours = 24`، ولديه حجز `WEBSITE` بحالة `PENDING` مضى على إنشائه 25 ساعة دون أي دفعة `SUCCEEDED`، وحجز آخر مضى عليه ساعتان فقط.
  2. **When** تعمل المهمة المجدولة الساعية `hourly-web-booking-expiry` (`runWebBookingExpiryScan`).
  3. **Then** يعمل الماسح تحت سياق `PLATFORM` لجلب الفنادق، ثم يدخل سياق `TENANT` + `tenantTx` لكل فندق، فيحول الحجز ذا الـ 25 ساعة إلى `CANCELLED` مع سبب `"انتهاء مهلة التأكيد التلقائية"`، ويُلغي فاتورته الصفرية (`VOID`)، ويسجل قيد تدقيق `AUTO_EXPIRE_WEB_BOOKING`، بينما لا يمس الحجز الحديث أو الحجوزات المدفوعة.

---

## 6. لوحة تحكم الموظفين والعمليات الفندقية (Staff Dashboard & Front-Desk Operations)

### 6.1 الوحدات التشغيلية في لوحة الموظفين
1. **إدارة الحجوزات والتسكين (`/reception/bookings` & `/reception/checkin`):**
   - البحث والفلترة، إنشاء حجز جديد، تعديل حجز، تمديد الإقامة (`ExtendStayModal`)، نقل النزيل لغرفة أخرى (`MoveRoomModal`)، وتخصيص الغرف الفيزيائية (`AssignRoomModal`).
2. **المخطط الزمني التفاعلي المتقدم (`Tape Chart Pro` — `/reception/tape-chart`):**
   - عرض شبكي لمدة 14 يوماً مجمّع حسب الطوابق.
   - شريط فلاتر علوي: بحث نصي (`q` بمهلة 300ms)، تصفية بنوع الغرفة (`roomTypeId`)، الطابق (`floor`)، والحالة (`status` للغرف أو الحجوزات).
   - **قائمة الحجوزات بانتظار التخصيص (`Unassigned Bookings Lane`):** شريط يعرض جميع حجوزات `CONFIRMED`/`PENDING` التي تحتوي على `BookingRoom.roomId === null` ضمن النافذة الزمنية.
   - دعم السحب والإفلات (Drag & Drop):
     * سحب بطاقة حجز من قائمة الانتظار وإفلاتها على غرفة متاحة في الشبكة يستدعي `POST /api/admin/bookings/[id]/assign-room`.
     * سحب شريط حجز مخصص عمودياً ينقل الغرفة (`move-room`)، وسحبه أفقياً يمدد الإقامة (`extend`).
   - وضع طباعة أفقي مخصص (`@media print` landscape) يخفي أزرار التحكم ويطبع الشبكة الزمنية فقط.
3. **التدبير الفندقي والصيانة والمفقودات (`Housekeeping`, `Maintenance`, `Lost & Found`):**
   - توليد مهام تنظيف تلقائية (`HousekeepingTask`) وتحويل نظافة الغرفة إلى `DIRTY` فور تسجيل مغادرة النزيل (`checkOut`).
   - تتبع المفقودات (`LostFound`) بحالاتها: مسجل، تم التسليم للمالك (`ClaimLostItemModal`)، أو تم التصرف به (`DisposeLostItemModal`).

### 6.2 قصص المستخدمين ومعايير القبول (Front-Desk & Tape Chart)

#### US-6.1: تخصيص الغرفة الفيزيائية وحارس تسجيل الدخول (`assignPhysicalRoom` & `checkIn` Guard)
- **بصفتي:** موظف استقبال (`RECEPTION`).
- **أريد:** إلزامي بتخصيص غرفة فيزيائية متاحة لكل حجز وارد من الموقع أو من Booking.com قبل السماح بتسجيل دخول النزيل (`Check-In`).
- **لأجل:** ضمان عدم دخول أي نزيل للفندق دون غرفة فعلية مسجلة باسمه في النظام.
- **معايير القبول:**
  1. **Given** حجز بحالة `CONFIRMED` يحتوي على صف `BookingRoom` فيه `roomId: null` و`roomTypeId: 'single'`.
  2. **When** يحاول موظف الاستقبال استدعاء `checkIn()` مباشرة.
  3. **Then** يرفض النظام العملية قبل أي تعديل في القاعدة ويرمي `ValidationError` (`422`): `"يجب تخصيص غرفة فيزيائية لكل غرف الحجز قبل تسجيل الدخول"`.
  4. **When** يستدعي الموظف `POST /api/admin/bookings/[id]/assign-room` (عبر `AssignRoomModal` أو بالسحب في Tape Chart) محتوياً على `{ bookingRoomId, roomId: 'room-101' }`.
  5. **Then** تقوم دالة `assignPhysicalRoom` بقفل الغرفة `room-101` بـ `FOR UPDATE`، وتتحقق من أنها تابعة لنفس الفندق، ومن نفس `roomTypeId`، وفي حالة `AVAILABLE`، ولا يتعارض تاريخها مع أي حجز آخر `CONFIRMED`/`CHECKED_IN`، ثم تحدث `BookingRoom.roomId`، وتحول الحجز من `PENDING` إلى `CONFIRMED` (إن اكتملت كل غرفه) دون تغيير رصيد الفاتورة (`Folio`)، وتسجل `ASSIGN_ROOM` في `AuditLog`.
  6. **When** يستدعي الموظف `checkIn()` بعد التخصيص.
  7. **Then** ينجح تسجيل الدخول ويتحول الحجز إلى `CHECKED_IN` والغرفة `101` إلى `OCCUPIED`.

#### US-6.2: نقل غرفة النزيل أثناء الإقامة (`moveRoom`) مع تسوية فرق السعر
- **بصفتي:** موظف استقبال.
- **أريد:** نقل نزيل مقيم إلى غرفة أخرى مع إمكانية تطبيق سعر الغرفة الجديدة أو الإبقاء على السعر القديم.
- **معايير القبول:**
  1. **Given** نزيل مقيم في الغرفة `101` ويرغب بالانتقال للغرفة `205` المتاحة.
  2. **When** ينفذ الموظف عملية النقل.
  3. **Then** تتحول الغرفة `101` إلى `AVAILABLE` + `DIRTY` (وتُنشأ لها مهمة تنظيف)، وتتحول الغرفة `205` إلى `OCCUPIED`، ويُسجل فرق السعر (إن وجد) كقيد مالي في الفاتورة داخل نفس `tenantTx`.

---

## 7. الدفتر المالي المفكوك، الفواتير، والمحافظ (Decoupled Financial Ledger, Folios & Wallets)

### 7.1 بنية الدفتر المالي (`Folio` & `FolioTransaction`)
- كل حجز يرتبط بفاتورة (`Folio`) تحتوي على ثلاثة أعمدة مجمعة:
  * `totalCharges`: مجموع الرسوم ناقص الخصومات النشطة.
  * `totalPaid`: صافي المدفوعات الناجحة ناقص المبالغ المستردة.
  * `balance`: الرصيد المستحق (`totalCharges - totalPaid`).
- **حالات الفاتورة (`FolioStatus`):** `ACTIVE` (مفتوحة للحركات)، `SETTLED` (مسددة ومغلقة عند المغادرة برصيد صفر)، `VOID` (ملغاة لحجز ملغى بلا مدفوعات).
- **أنواع الحركات (`FolioTransaction`):**
  * الفئات (`category`): `ROOM_CHARGE`, `SERVICE`, `RESTAURANT`, `SAFE_DEPOSIT`, `TAX`, `DISCOUNT`, `PAYMENT`, `REFUND`, `ADJUSTMENT`.
  * لا يُسمح بحذف أي حركة مالية من قاعدة البيانات؛ الإلغاء يتم عبر وسم الحركة بـ `isVoided = true` (مع ذكر السبب والمستخدم) وعكس أثرها حسابياً داخل `tenantTx`، وتوثيقها في `AuditLog`.

### 7.2 محفظة النزيل (`Guest Wallet`) والخزائن (`Safeboxes` & `SafeDepositBox`)
- **محفظة النزيل (`Wallet`):** حساب مالي خاص بالنزيل داخل الفندق يدعم الإيداع (`DEPOSIT`)، السحب (`WITHDRAWAL`)، الدفع المباشر لفواتير الحجز أو المطعم (`PAYMENT`)، وتجميد المحفظة (`Freeze`)، مع إصدار إيصالات PDF رسمية (`wallet-receipt-pdf.service.ts`).
- **نقاط بيع المطعم (`Restaurant POS`):** يدعم إنشاء الطلبات (`RestaurantOrder`) وتسويتها إما بالدفع الفوري (نقدي/بطاقة/محفظة) أو بترحيلها إلى فاتورة غرفة النزيل المقيم (مع احترام قواعد التوجيه إذا كان النزيل ضمن مجموعة).
- **صناديق الأمانات والخزائن (`SafeDepositBox` & `SafeBox`):** إدارة إيجار الخزائن وتسجيل المقتنيات الثمينة (`SafeDepositBoxItem`) وترحيل رسومها تلقائياً إلى الفاتورة.

### 7.3 قصص المستخدمين ومعايير القبول المالية

#### US-7.1: حارس التسوية المالية عند تسجيل الخروج (`Strict Checkout Finance Guard`)
- **بصفتي:** محاسب أو مدير فندق.
- **أريد:** منع تسجيل مغادرة أي نزيل (`Check-Out`) ما لم يكن رصيد فاتورته صفراً تماماً (`balance === 0`).
- **لأجل:** منع ضياع مستحقات الفندق أو مغادرة نزيل وعليه مبالغ غير محصلة أو له مبالغ غير مسواة.
- **معايير القبول:**
  1. **Given** حجز في حالة `CHECKED_IN` وفاتورته تحمل `totalCharges = 500` و`totalPaid = 300` (`balance = 200`).
  2. **When** يستدعي الموظف `bookingService.checkOut`.
  3. **Then** يرفض النظام العملية ويرمي `ValidationError` يطالب بتسديد الرصيد المتبقي (`200`).
  4. **When** يتم تسجيل دفعة ناجحة بقيمة `200` فيصبح `balance = 0`، ثم يُستدعى `checkOut`.
  5. **Then** ينجح تسجيل الخروج، وتتحول حالة الحجز إلى `CHECKED_OUT`، وحالة الفاتورة إلى `SETTLED`، وحالة الغرفة إلى `AVAILABLE` + `DIRTY`.

---

## 8. حجوزات المجموعات والفوترة الشهرية للشركات (Group Bookings & Corporate Billing)

### 8.1 حجوزات المجموعات وتوجيه الرسوم (`GroupBooking` & `FolioRoutingRule`)
- **الهيكلية:** كل مجموعة (`GroupBooking`) تمتلك فاتورة رئيسية (`masterFolio`)، وبيانات الجهة المنظمة (`companyName`, `contactName`, `contactPhone`, `contactEmail`, `checkIn`, `checkOut`, `status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'`, `notes`)، وقائمة من الحجوزات الفردية للأعضاء (`bookings`) لكل منها فاتورته الفرعية (`Sub-Folio`).
- **قواعد التوجيه (`FolioRoutingRule`):** تحدد الفئات المالية التي تُحمل تلقائياً على `masterFolio` بدلاً من فاتورة النزيل الفرعية (مثلاً: توجيه `ROOM_CHARGE` للشركة، وترك `RESTAURANT` و`SERVICE` على حساب النزيل الشخصي).
- **التقرير الموحد للمجموعة (`GET /api/admin/group-bookings/[id]/report` — `v9.4`):**
  * يجمع مؤشرات الإشغال (`totalBookings`, `cancelledBookings`, `statusBreakdown`, `totalRooms`, `assignedRooms`, `unassignedRooms`, `totalRoomNights`, `totalGuests`).
  * يجمع المؤشرات المالية (`masterFolio`, `subFoliosTotals` مع استثناء الفواتير الملغاة `VOID` الصفرية، `consolidatedTotals`, تفصيل الفئات `chargesByCategory`, وتفصيل طرق الدفع الصافية بعد الاسترداد `paymentsByMethod`).
  * يعرض التقرير في نافذة `GroupReportModal` قابلة للطباعة.

### 8.2 أتمتة الفوترة الشهرية للشركات (`Corporate Billing` & `ExternalClient` — `v9.5`)
- **العميل الخارجي / الشركة (`ExternalClient`):** يمثل شركة أو مؤسسة متعاقدة مع الفندق.
- **الفاتورة المؤسسية (`Invoice`):**
  * تحمل رقماً تسلسلياً فريداً `CORP-YYYYMM-XXXX`، وحالة دورة حياة مضبوطة (`DRAFT`, `ISSUED`, `PAID`, `VOID`).
  * توثق فترة الفوترة (`periodStart`, `periodEnd`)، تاريخ الاستحقاق (`dueDate`)، تاريخ السداد (`paidAt`)، المبلغ الفرعي (`subtotal`)، الضريبة (`taxAmount`)، الإجمالي (`total`)، المبلغ المسدد (`paidAmount`)، ولقطة البنود التفصيلية (`items` JSON).

### 8.3 قصص المستخدمين ومعايير القبول (المجموعات والشركات)

#### US-8.1: إصدار كشف حساب وفاتورة شهرية موحدة للشركة (`generateMonthlyStatement`)
- **بصفتي:** محاسب الفندق (`ACCOUNTANT`).
- **أريد:** توليد فاتورة شهرية مجمعة لعميل شركة (`ExternalClient`) عن فترة محددة `[periodStart, periodEnd]` مع حساب الضريبة وتاريخ الاستحقاق.
- **معايير القبول:**
  1. **Given** شركة مسجلة في الفندق ولديها فواتير/بنود مستحقة خلال الشهر بقيمة `subtotal = 2000` ونسبة ضريبة `10%`.
  2. **When** يستدعي المحاسب `POST /api/admin/external-clients/[id]/invoices`.
  3. **Then** ينشئ النظام فاتورة برقم `CORP-YYYYMM-XXXX` بحالة `ISSUED`، وبقيم `subtotal = 2000`, `taxAmount = 200`, `total = 2200`, `paidAmount = 0` داخل `tenantTx` مع تسجيل `CREATE_CORPORATE_INVOICE` في `AuditLog`.

#### US-8.2: السداد الجزئي والكلي لفاتورة الشركة وتتبع المتأخرات (`recordInvoicePayment` & Aging)
- **بصفتي:** محاسب الفندق.
- **أريد:** تسجيل الدفعات الواردة من الشركة (جزئياً أو كلياً) ومعرفة الرصيد المتأخر (`overdueBalance`) الذي تجاوز تاريخ الاستحقاق (`dueDate`).
- **معايير القبول:**
  1. **Given** فاتورة شركة بحالة `ISSUED` وإجمالي `2200`.
  2. **When** يسجل المحاسب دفعة أولى بقيمة `1000` عبر `POST /api/admin/external-clients/[id]/invoices/[invoiceId]/pay`.
  3. **Then** يقفل النظام صف الفاتورة بـ `FOR UPDATE`، ويحدث `paidAmount = 1000` وتبقى الحالة `ISSUED`، ويكون الرصيد القائم `outstandingBalance = 1200`.
  4. **When** يسجل المحاسب الدفعة المتبقية `1200`.
  5. **Then** يصبح `paidAmount = 2200`، وتتحول حالة الفاتورة تلقائياً إلى `PAID` مع ختم `paidAt = now()`، ويُرفض أي سداد إضافي لاحق على الفاتورة المسددة أو الملغاة (`VOID`).

---

## 9. مدير القنوات العالمي، بوابات الدفع، وامتثال PCI-DSS/VCC

### 9.1 مدير القنوات (`Channel Manager` — Booking.com / Expedia)
- **ربط الغرف والأسعار (`ChannelMapping`):** يربط كل فندق معرّفات أنواع الغرف وخطط الأسعار الخارجية (`channelRoomTypeId`, `channelRatePlanId`) بمعرّفاته المحلية (`roomTypeId`, `ratePlanId`).
- **استقبال الحجوزات الواردة (`ingestInbound`):**
  * يتحقق من عدم تكرار الحجز عبر `externalRef` (Idempotency).
  * يحول العملة والتواريخ والأسعار، وينشئ الحجز والفاتورة داخل `tenantTx` مع ترك `roomId: null` ليظهر في قائمة الانتظار في الاستقبال وTape Chart.
- **مزامنة التوفر والأسعار الصادرة (`buildSnapshot`, `pushToOTA`, `pushRatePlan`):**
  * عند أي تغيير في التوفر أو الأسعار، تُبنى لقطة الأسعار والتوفر (`ChannelPriceSnapshot`) وتُدفع عبر طوابير BullMQ إلى القنوات المربوطة.

### 9.2 بوابات الدفع المحلية (`Plutu` & `T-Lync`)
- تُدار إعدادات البوابات لكل فندق عبر `IntegrationConfig` (مع تشفير الأسرار).
- تخضع جميع الـ Webhooks الواردة (`/api/external/gateways/[provider]/webhook`) للتحقق من التوقيع التشفيري، ومنع التكرار عبر جدول `GatewayWebhook`، وتحديث `PaymentSession` و`Folio` ذرياً.

### 9.3 خزينة البطاقات الائتمانية الافتراضية وامتثال PCI-DSS (`M10 VCC`)
- **التطبيع والتوكنة (`W1` & `W2`):** تمر الحجوزات الحاملة لبطاقات افتراضية عبر مسار VGS Inbound Proxy (`/api/external/channel/vgs/[provider]/bookings`) حيث تُستبدل أرقام البطاقات (`PAN`, `Expiry`, `CVV`) بتوكنات VGS معزولة قبل وصولها لتطبيق الفندق.
- **الكشف الآمن المؤقت (`W3` — `VCCReveal.tsx`):**
  * يعرض موظف الاستقبال المخول البطاقة داخل VGS Reveal Iframe لمدة **60 ثانية فقط** ثم تُغلق وتُحجب تلقائياً.
  * يسجل مسار `GET /api/admin/bookings/[id]/vcc-tokens` عملية الكشف فوراً في جدول `VCCAuditLog` (`action: 'revealed'`) مع هوية المستخدم والفندق.
- **التطهير اليومي الآلي (`W4` — `purgeVCC.job.ts`):**
  * تعمل مهمة `daily-vcc-purge-scan` يومياً الساعة `03:00 Africa/Tripoli`.
  * تمسح تحت سياق `PLATFORM` جميع المدفوعات التي تحتوي على توكنات VCC ومضى على مغادرة حجزها (`CHECKED_OUT`) أو إلغائه (`CANCELLED`) **7 أيام فأكثر**.
  * تطلق لكل دفعة مهمة `purge-vcc` تحمل `hotelId` وتعمل تحت سياق `TENANT` لحذف التوكنات من خزينة VGS (مع معالجة `404` كنجاح متكرر آمن Idempotent)، وتصفير الحقول الثلاثة في قاعدة البيانات، وختم `vccPurgedAt`، وتسجيل `action: 'purged'` في `VCCAuditLog`.

---

## 10. البنية غير المتزامنة، الملاحظية، ومعايير القبول غير الوظيفية (NFRs & Verification Gates)

### 10.1 طوابير العمل الخلفية الثمانية (`BullMQ` — `M9`)
تعمل 8 طوابير متخصصة تحت البادئة `cm-*`:
1. `snapshot` (`cm-snapshot`): بناء لقطات التوفر والأسعار.
2. `publish` (`cm-publish`): دفع تحديثات التوفر إلى OTAs.
3. `ingest` (`cm-ingest`): معالجة الحجوزات الواردة وبطاقات VCC.
4. `rates` (`cm-rates`): دفع تحديثات خطط الأسعار.
5. `reconcile` (`cm-reconcile`): المطابقة الدورية للمخزون + المهمة الساعية لإلغاء الحجوزات المعلقة (`hourly-web-booking-expiry`).
6. `purge` (`cm-purge`): الماسح اليومي وحذف توكنات البطاقات الافتراضية (`daily-vcc-purge-scan` & `purge-vcc`).
7. `webhook` (`cm-webhook-delivery`): تسليم الـ Webhooks الصادرة مع احترام `Retry-After` وحد المعدل `60/min`.
8. `dlq` (`cm-dlq`): طابور الرسائل الميتة الموحد؛ أي وظيفة تستنفد محاولاتها (Exponential Backoff + Jitter 0.2) تُنقل إليه آلياً مع كامل تفاصيل الخطأ والـ Stacktrace للمراجعة عبر `/superadmin/jobs`.

### 10.2 الملاحظية وفحوص الجاهزية (`Observability & Health Probes`)
- **السجل الموحد (`src/lib/observability/logger.ts`):** يعتمد على `pino` ويحقن `hotelId` أو `actor: 'PLATFORM'` تلقائياً من `AsyncLocalStorage`، مع حجب إلزامي (Redaction) لأي حقول سرية (`password`, `token`, `authorization`, `cookie`, `vcc*`, `pan`, `cvv`). يُحظر استخدام `console.*` في كود الإنتاج.
- **مسارات الفحص:**
  * `GET /api/health`: فحص حياة الخادم السريع (Liveness).
  * `GET /api/ready`: فحص الجاهزية العميق (Readiness)؛ يتحقق من اتصال PostgreSQL (`SELECT 1`)، اتصال Redis (`PING`)، صحة الطوابير، وتشغيل **الحصر الآلي لسياسات العزل (`runRlsCensus`)** للتأكد من أن جميع جداول المستأجرين محمية بـ `FORCE RLS` قبل قبول حركة المرور.

### 10.3 بوابة التحقق الهندسية الإلزامية (Mandatory Verification Gate)
لا يُقبل دمج أي ميزة أو إصدار في الفرع الرئيسي `master` إلا بعد تحقيق الشروط الخمسة التالية مجتمعة:
1. **`npx tsc --noEmit`:** صفر أخطاء في فحص الأنواع، مع حظر تام لـ `any` أو `as any` أو `as unknown` أو `@ts-ignore`.
2. **`npx next lint`:** صفر أخطاء ESLint.
3. **`npm run verify:rls`:** مطابقة تامة لحصر سياسات PostgreSQL RLS (`tenant_isolation=54`, `forceRls=59`, `triggers=19`, وقيود `RESTRICT/CASCADE`).
4. **اختبارات الوحدة والتكامل (`npx vitest run`):** نجاح 100% لجميع ملفات الاختبار على قاعدة بيانات `hotel_test` الحقيقية.
5. **اختبارات النهاية إلى النهاية (`npm run test:e2e`):** نجاح 100% لاختبارات Playwright على متصفح حقيقي وخادم بوابات دفع محلي (`e2e-dummy-gateway`).