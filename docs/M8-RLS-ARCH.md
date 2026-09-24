# M8 — Multi-Tenancy Hardening: Row-Level Security (Phase-1 + Phase-2)

معمارية عزل المستأجرين على مستوى قاعدة البيانات بنظام **Row-Level Security** المضبوط عبر جلسة Prisma، بحيث لا يعتمد أمن التعدد على تذكّر المطوّر لوضع `hotelId` في كل استعلام — بل يُفرَض فرضاً من طبقة DB وظيفةً، ويُحقن تلقائياً من طبقة التطبيق.

---

## 1. الأدوار (Roles)

| الدور | BYPASSRLS | الاستخدام |
|-------|-----------|-----------|
| `app_tenant` | لا | **كل طلب app عادي** — RLS مُفعّل عليه، لا يرى إلا صفوف فندق جلسة `app.current_hotel_id` |
| `app_platform` | نعم | مسارات Super-Admin العالمية + الجداول العامة (Hotels, invitations, webhook bootstrap, counters) |
| `app_migrator` | نعم | أدوات صيانة/seed/backfill غير DDL |

- **كلمة المرور**: `APP_DB_PASSWORD` / `PLATFORM_DB_PASSWORD` / `MIGRATOR_DB_PASSWORD` مع قيم **تطوير محلية فقط** (`app_tenant_dev_only_2026` …) — لا تُعاد في بيئات حقيقية.
- **صلاحيات**: `GRANT` على كل جداول/متتاليات `public` + `ALTER DEFAULT PRIVILEGES` (كائنات الترحيلات المستقبلية تكتسب الصلاحيات تلقائياً لأن الترحيل يركض بصلاحية superuser).
- **Idempotent/آمن**: الدور يُنشأ **فقط عند غيابه** (بدون `DO`/`ALTER ROLE`)، لأن `CREATE ROLE` داخل DO متبوعاً بـ `ALTER ROLE` في نفس الجلسة يصطدم بسباق pg المعروف `tuple concurrently updated` (XX000).
- الملف: `apps/web/scripts/provision-db-roles.ts` (تصدير `provisionRoles(adminUrl)` + وضع مستقل عند التشغيل المباشر).

> ملاحظة تشغيل: الرئيسي `main()` محروس — لا يستدعي نفسه عند `import` (منع الازدواج مع سلسلة e2e).

## 2. محرك RLS

- تابع `public.app_hotel_id()` يقرأ GUC الجلسة `app.current_hotel_id`:
  - مضبوط → يعيد قيمته.
  - غير مضبوط → `NULL`.
- سياسات القراءة/الكتابة لكل جدول: `app_hotel_id() = hotelId`.
  - **`app_tenant` بدون GUC → 0 صفوف** (fail-closed).
  - GUC تُضبط داخل نطاق المعاملة فقط (`set_config(..., true)` — is_local) فتلاشى بعد نهايتها مطابقةً لمعاملات التطبيق.

## 3. تصنيف الجداول

| الفئة | العدد | السياسة |
|-------|-------|---------|
| **مستأجَر** (لديه عمود `hotelId`) | 54 | `tenant_isolation` (تعريفها `app_hotel_id() = hotelId`) — كتالوج يُعدّ آلياً: أي جدول `public` فيه عمود `hotelId` (40 في Phase-1 + **14 إضافياً في Phase-2-b**) |
| **مشتق** (بلا `hotelId` — أبناء/أحفاد) | 0 | `tenant_derived` (`EXISTS` على سلسلة الأبوين) — **أُفرِغت في Phase-2-b**: الـ14 طفلاً أصبحوا أعمدة `hotelId` حقيقية فانتقلوا إلى `tenant_isolation`؛ الخريطة في `scripts/apply-rls.ts` فارغة الآن وتظلّ الآلية متاحةً لأي جدول مستقبلي بلا عمود |
| **عام** (كل فندق/منصة) | 5 | `allow_all` — `Hotel`, `RefreshToken`, `OtpChallenge`, `PlatformAuditLog`, `BookingNumberCounter` |
| **FORCE RLS** | 59 | كل الجداول المذكورة + `Hotel` مقيّد أيضاً |

- صنّاف `apply-rls` كتالوجي (يقرأ `information_schema.columns`): الجدول المكتشف عليه عمود `hotelId` يُصنّف `tenant_isolation` تلقائياً؛ بلا عمود وبلا خريطة مشتقة → **رفض تشغيلي** (لا يُترك جدول بلا حماية).
- **تقارب صارم:** كل سياسة تُثبَّت تبدأ بـ `DROP POLICY IF EXISTS` للفئتين الأخريين — فإذا انتقل جدول بين التصنيفات (كما حدث للـ14 في Phase-2-b) لا تبقى سياسات قديمة زائدة؛ الخراج `rls.sql` مطابق دائماً لحالة القاعدة الفعلية (تحقّق: `54|0|5` على `hotel_management` و`hotel_e2e`).

## 4. تطويقات اشتقاق `hotelId` (دفاع في العمق) — 19 تطويقاً بقفل

كل تطويق `BEFORE INSERT OR UPDATE` يقرأ `hotelId` الأب عبر
`SELECT <hotelId الهدف> FROM <الأب…> WHERE … ORDER BY <سلسلة ids> FOR NO KEY UPDATE OF <الأب…> SKIP LOCKED`
ثم يملأ `NEW."hotelId"`؛ غياب الأب → `RAISE 'cannot derive hotelId …' (P0001)`. النظام **حتمي الترتيب** (PK order) و**لا يحجز على أبٍ يُنقل بين الفنادق تزامناً** (SKIP LOCKED).

**أ. النواة المالية الخمسة (M8 Phase-1 — أعيد توليدها بنمط القفل):**

| التطويق | الجدول | الأب/المسار |
|--------|--------|------|
| `trg_folio_hotel` | `Folio` | `Booking` |
| `trg_folio_transaction_hotel` | `FolioTransaction` | `Folio` |
| `trg_folio_discount_hotel` | `FolioDiscount` | `Folio` |
| `trg_scheduled_charge_hotel` | `ScheduledCharge` | `Folio` |
| `trg_room_charge_hotel` | `RoomCharge` | `BookingRoom → Booking` (قفزتان) |

**ب. أطفال الأبوين المستأجرين الأربعة عشر (M8 Phase-2-b):**

| التطويق | الجدول | الأب/المسار |
|--------|--------|------|
| `trg_booking_room_hotel` | `BookingRoom` | `Booking` |
| `trg_booking_service_hotel` | `BookingService` | `Booking` |
| `trg_guest_document_hotel` | `GuestDocument` | `Guest` |
| `trg_folio_routing_rule_hotel` | `FolioRoutingRule` | `GroupBooking` |
| `trg_invoice_hotel` | `Invoice` | `Folio` **أو** `ExternalClient` (أبوان اختياريان — فحص بالترتيب) |
| `trg_refund_hotel` | `Refund` | `Payment` |
| `trg_restaurant_order_item_hotel` | `RestaurantOrderItem` | `RestaurantOrder` |
| `trg_room_type_amenity_hotel` | `RoomTypeAmenity` | `RoomType` |
| `trg_room_type_default_service_hotel` | `RoomTypeDefaultService` | `RoomType` |
| `trg_room_type_extra_bed_hotel` | `RoomTypeExtraBed` | `RoomType` |
| `trg_safe_box_transaction_hotel` | `SafeBoxTransaction` | `SafeDepositBox` |
| `trg_safe_deposit_box_item_hotel` | `SafeDepositBoxItem` | `SafeDepositBox` |
| `trg_wallet_transaction_hotel` | `WalletTransaction` | `Wallet` |
| `trg_webhook_endpoint_hotel` | `WebhookEndpoint` | `ApiPartner` |

**مصدر حقيقة واحد:** `apps/web/scripts/generate-child-hotelid-migration.ts` يصدّر `childTriggerSqls()` و`derivedChildTables()`، ويستهلكها **مسارا التثبيت معاً**: ترحيل `20260926000000_add_derived_child_hotel_id` اليدوي، و`apply-rls.ts` لقاعدة `prisma db push` الجديدة — فالتطويقات متطابقة حرفياً في الحالتين.

الفائدة: أي مسار داخل المعاملة (حيث لا يعمل تعارض التطبيق) يضمن له `hotelId` الصحيح حتى لو نسي تمريره صراحةً.

## 5. الجانب التطبيقي (Prisma)

- **عميلان** من `src/lib/utils/prisma.ts`:
  - `prisma` — موسَّع (استعلامات المستأجر)، ومختصر بصلاحية `app_tenant` في E2E.
  - `prismaPlatform` — للعمليات المنصّاتية وما فوق المستأجر (BYPASSRLS).
- **حقن مركزي** في اعتراض `prisma` تحت سياق TENANT:
  - أعلى مستوى: أي `create`/`createMany`/`upsert` على 40 نموذجاً يستلم `hotelId` تلقائياً.
  - نسقي (nested): خريطة `NESTED_HOTEL_MODEL` (`folio`/`masterFolio` → `Folio`، `transactions` → `FolioTransaction` …) تملأ ما ينقص داخل `create` الأبوين.
  - **تجاهل مقصود**: عمليات `connect`/قراءة غير إنشائية لا تُتلمس.
- **`tenantTx(cb, options)`**:
  1. يقرأ سياق المستأجر من AsyncLocalStorage (`getTenantContext`).
  2. `PLATFORM` → معاملة `prismaPlatform` بلا GUC ولا حقن.
  3. `TENANT` → فتح `prismaBase.$transaction`، ضبط `set_config('app.current_hotel_id', …, true)` داخل المعاملة، ثم يمرّر `cb` **`tx` ملفوفاً بـ Proxy** يحقن `hotelId` في كل `create`-family — فتغطّى جميع مواقع الاستدعاء السابقة/المستقبلية بدون تعديل يدوي (عقب `tx` كان مُصفَّحاً `any` فتقف المسؤولية على الـ Proxy + التطويقات).
- الجداول المالية الخمسة أصبحت تتطلب `hotelId` في إدخالات Prisma: المواقع الثلاثة ذات الحرفية المباشرة (وليست داخل `tenantTx` — `restaurant-orders/[id]`، `scheduledCharge.createMany`، `folioDiscount.create`) مرّرت `hotelId` صراحةً.
- **Phase-2-b في `schema.prisma`:** الـ14 جدولاً المشتقّة سابقاً أصبحت تحمل `hotelId` (نموذجاً + علاقة + `@@index`)، فيدخلون — مثل أي جدول مستأجَر — دائرة تعتراض `create`-family المركزي (حقن تلقائي تحت TENANT) ودائرة `tenantTx` دون أي تعديل إضافي على المواقع التي تُنشئها داخل معاملة.
- قاعدة `prisma db push` الجديدة (مسارات E2E للتطوير والاختبار) تُغطى كاملةً من `applyRls()`: 54 بالعزل المباشر + 5 عامة + **الـ19 تطويقاً** (بما أن `apply-rls.ts` يستورد `childTriggerSqls()` — تطابق حرفي مع الترحيل اليدوي).

## 6. الترحيل

- `apps/web/prisma/migrations/20260922000000_add_financial_hotel_id/migration.sql` (يدوي الصنع، لأن `prisma migrate dev` يضرب بدفت سابقة في مشاريع shadow DB — فلو سير العمل «db push + SQL بالأيدي»):
  1. `ADD COLUMN hotelId` nullable
  2. `UPDATE` backfill من الأبوين (Folio ← Booking؛ حركات/خصومات/مستحقات ← Folio؛ رسوم غرفة ← BookingRoom→Booking)
  3. `SET NOT NULL`
  4. `FK ON DELETE RESTRICT ON UPDATE CASCADE` + `@@index([hotelId])`
- طُبّق على `hotel_management` (backfill 2/3) و`hotel_e2e` (backfill 7/4) ثم `prisma db push` أعاد «in sync».

### Phase-2-b — ترحيل `20260926000000_add_derived_child_hotel_id`

- **يدوي الصنع عبر `scripts/generate-child-hotelid-migration.ts`** (نفس تدفق Phase-1: كتابة SQL → `psql -f` → `db push`). لكل من الـ14 جدولاً: `ADD COLUMN IF NOT EXISTS hotelId TEXT` → backfill `UPDATE … FROM` الأب (و`Invoice` من أيٍّ من أبويها عبر كلتَي حلقتَي `UPDATE`) → `SET NOT NULL` (يفشل بصخب فوق اليتامى) → `FK → Hotel ON DELETE RESTRICT ON UPDATE CASCADE` → `CREATE INDEX` → تطويق `trg_*_hotel`.
- طُبّق على `hotel_management` و`hotel_e2e` (idempotent — `--dry-run` لإعادة توليد الملف فقط)؛ `schema.prisma` محدَّث بالـ14 حقلاً و`prisma db push` أعاد «in sync».
- التحقق النهائي على القاعدتين: `54` سياسة `tenant_isolation`/`0` `tenant_derived`/`5` `allow_all`، `59` FORCE RLS، `19` تطويقات `trg_*_hotel`.

## 7. سلسلة E2E

- `apps/web/tests/e2e/setup/env.ts`: `APP_DATABASE_URL` (=`app_tenant` بصلاحية RLS) + `PLATFORM_DATABASE_URL` (=`app_platform`) تمرَّران للتطبيق عبر `APP_ENV_EXTRA` → **الخادم E2E يركض تحت RLS فعلياً**.
- `apps/web/scripts/e2e-prepare-db.ts` = إنشاء القاعدة → `provisionRoles` → `pushSchema` → `applyRls` — والـ `applyRls` يثبّت الآن كامل الـ54/5 مع **الـ19 تطويقاً**، فالخط الجديد E2E يحاكي الإنتاج تماماً.
- **عزل حدّ الطلبات (Redis):** اختبارات السوبر أدمن الحساسة لحصة `stepup:request` (`3/15min`) وأخواتها كانت تتراكم عبر اختبارات الجلسة الواحدة فتضرب `429 RATE_LIMITED` (اختباران من 22). أُضيف `tests/e2e/setup/rate-limit.ts` — `resetRateLimitKeys()` يمسح مفاتيح `stepup:*/otp:*/ratelimit:payment-session:*` من Redis **قبل كل اختبار** (يقترن بمسح DB الموجود في `beforeEach`)، فيعود كل اختبار لحالة نظيفة ويبقى الحد الفعلي فاعلاً داخل نطاق الاختبار الواحد.
- إعادة تعيين كاملة: `E2E_FRESH_DB=1` (إلزامية أول مرة بعد الترحيل إن كانت `hotel_e2e` تملك صفوفاً لأن `db push` لا يضيف عمود NOT NULL فوق صفوف موجودة).

## 8. بوابات التحقق

- `tsc`/`lint`/`build` نظيف؛ E2E **22/22** على `hotel_e2e` (بوصف `app_tenant`).
- تحقق يدوي: `psql -U app_tenant hotel_e2e` → بدون `set_config` **0 صفوف** في أي جدول مستأجَر؛ مع GUC الصحيح → صفوف ذلك الفندق فقط.
- تحقق التعداد (أمر): `SELECT polname, count(*) FROM pg_policy GROUP BY 1;` → `tenant_isolation 54 / tenant_derived 0 / allow_all 5` و`review p.tgname` من `pg_trigger` → `19 × trg_*_hotel`.