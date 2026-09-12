# Super-Admin Dashboard & Invitation Management — خطة المرحلة v3.6 ✅

## الهدف
بناء واجهة لوحة التحكم العليا (Super-Admin UI) وإدارة الدعوات — بحيث يتمكن مالك المنصة من إدارة الفنادق ومستأجريها من متصفح واحد، مع إبقاء البنية صارمة 1:1 (رفض «التعددية عبر الفنادق» و `ENFORCE_TENANT_DOMAIN` في هذه المرحلة لمنع زحف النطاق).

## المبادئ
- حماية مزدوجة: **Edge Middleware** (يتطلب `SUPER_ADMIN` في التوكن، وإلا `/access-denied`) + **حارس Layout** من جهة العميل (قراءة `localStorage.user` والتحقق من الدور).
- بنية 1:1: كل فندق مستأجر مستقل — لا تبديل بين فنادق، لا تسجيل ذاتي.
- إعادة إرسال الدعوة تُبطل الرابط القديم (يُستبدل `tokenHash` ويُمَدَّد `expiresAt` 7 أيام) — الرابط الجديد فقط يصلح.
- روابط الدعوات تُبنى دائماً على نطاق المنصة الأساسي عبر `buildInvitationLink`.

## المهام المنفّذة
### المهمة 1 — التوجيه والحماية
- [x] `src/app/(dashboard)/superadmin/layout.tsx` — حارس دور + تبويبات (الفنادق / الدعوات)
- [x] `middleware.ts` — إضافة `/superadmin` إلى `RESTRICTED_PREFIXES` + رفض غير `SUPER_ADMIN` في الـ Edge
- [x] قائمة Sidebar جديدة `SUPER_ADMIN` في `(dashboard)/layout.tsx`

### المهمة 2 — لوحة الفنادق
- [x] `GET /api/superadmin/hotels` — كل الفنادق مع `customDomain` و `createdAt` وعدّادات المستخدمين/الدعوات المعلقة
- [x] `src/app/(dashboard)/superadmin/hotels/page.tsx` — جدول + نافذة «إنشاء فندق» تعرض رابط الدعوة مع زر نسخ + نافذة «تعديل النطاق»
- [x] إعادة استخدام `buildInvitationLink` في `POST /api/superadmin/hotels` (إزالة التكرار)

### المهمة 3 — إدارة الدعوات
- [x] `GET /api/superadmin/invitations` — كل الدعوات مع الحالة المحسوبة (PENDING/EXPIRED/USED) + الفندق + المنشئ
- [x] `POST /api/superadmin/invitations/[id]/resend` — تجديد التوكن والصلاحية + إبطال القديم + رابط جديد (CSRF + Rate Limit)
- [x] `src/app/(dashboard)/superadmin/invitations/page.tsx` — جدول + بطاقات ملخص + زر إعادة إرسال + عرض الرابط الجديد بنسخ فوري

### الجودة
- [x] `src/lib/utils/invitation-link.ts` — مساعد موحّد لبناء رابط الدعوة
- [x] `tests/integration/superadmin-dashboard.test.ts` — 13 اختبار (حماية الأدوار، القوائم، الحالة المحسوبة، إعادة الإرسال: تجديد التوكن/الانتهاء/المستخدمة/غير الموجودة)
- [x] README — العمارة + API + changelog v3.6 + roadmap المرحلة 8
- [x] lint + typecheck + كامل suite (17 ملفات / 146 اختبار ✅)

## النتيجة
- 146 اختبار ✅ (133 سابقاً + 13 جديد)
- typecheck ✅ / lint ✅
- خادم التطوير على المنفذ 3001 — تم التحقق: `/api/superadmin/*` يعيد 401 بلا مصادقة، و `/superadmin/*` يعيد 307 إلى تسجيل الدخول بلا توكن

## ملاحظات لاحقة
- صفحات حجز عامة لكل فندق (White-label Booking Pages) كخطوة تالية مقترحة.
- لوحة تطوير: أتمتة فحص Cloudflare IP ranges لإحكام منطق الثقة.
