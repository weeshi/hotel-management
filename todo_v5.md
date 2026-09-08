# White-Label SaaS — خطة المرحلة v3.5 ✅

## الهدف
تحديد هوية الفندق عبر Hostname (`customDomain`) مع تخصيص صفحة الدخول وقفل دخول صارم لكل فندق، والإجابة على ثلاثة أسئلة معمارية من المدير التنفيذي.

## القرارات المعمارية الثلاثة (الرد على CEO)
1. **روابط الدعوات ثابتة على نطاق المنصة الأساسي** — لا تُبنى على `customDomain` الجديد، لتعمل فوراً أثناء انتشار DNS/Cloudflare. النطاق يُمرَّر كمعامل إرشادي `?domain=` فقط.
2. **الثقة في `x-forwarded-host` فقط عبر Cloudflare** — وجود رأس `cf-ray` يثبت أن الطلب مرّ عبر Cloudflare؛ وإلا يُستخدم `host` فقط (لا تُصدَّق رؤوس مُمرَّرة من طلبات مباشرة). مع خيار `TRUST_PROXY=true` وطبقة اختيارية `ENFORCE_TENANT_DOMAIN=true`.
3. **الكوكيز host-only (بلا `Domain`)** — لا تغيير في كود الكوكيز؛ العزل حسب النطاق تلقائي. فقط حارس اختبار يضمن غياب `Domain` في `Set-Cookie` + توثيق.

## المبادئ
- النطاق ليس سلطةً أمنية — الوصول للبيانات عبر `hotelId` في JWT فقط.
- قرار النطاق → فندق يتم في بيئة Node (باستخدام Prisma)، وليس في Edge Middleware.
- قفل دخول صارم: على `customDomain` الفندق، يدخل مستخدموه فقط برسالة موحّدة.

## المهام المنفّذة
- [x] `customDomain String? @unique` في `Hotel` + `db push` + `generate`
- [x] `src/lib/utils/tenant.ts` — `normalizeDomain`, `getEffectiveHost` (منطق cf-ray), `resolveTenantFromRequest`
- [x] `middleware.ts` — تمرير `x-tenant-host` (edge-safe، للمسارات فقط)
- [x] `GET /api/auth/context` — معدّل طلبات + `{ hotelId?, hotelName? }` فقط
- [x] قفل الدخول — `authService.login(email, password, hotelId?)` + ربطه في `/api/auth/login`
- [x] `POST /api/superadmin/hotels` — يقبل `customDomain` + رابط الدعوة من `NEXT_PUBLIC_APP_URL`
- [x] `PATCH /api/superadmin/hotels/[id]` — تحديث/مسح `customDomain` (SUPER_ADMIN + CSRF)
- [x] تخصيص صفحة الدخول عبر نقطة السياق
- [x] `customDomainSchema` + `updateHotelCustomDomainSchema` في `packages/shared`
- [x] `tests/integration/tenant-domain.test.ts` — 19 اختبار (إنشاء/تطبيع/تكرار، PATCH، قفل دخول ثنائي الاتجاه، سياق، رابط SaaS، كوكيز بلا Domain)
- [x] README — العمارة + API + changelog v3.5 + سلوك الكوكيز
- [x] lint + typecheck + كامل suite (16 ملفات / 133 اختبار ✅)

## النتيجة
- 133 اختبار ✅ (114 سابقاً + 19 جديد)
- typecheck ✅ / lint ✅
- خادم التطوير يعمل على المنفذ 3001

## ملاحظات لاحقة
- تفعيل `ENFORCE_TENANT_DOMAIN=true` في الإنتاج بعد اعتماد النطاقات.
- تحديد نطاقات Cloudflare IP ranges في البيئة عند الحاجة لفحص أقوى.
