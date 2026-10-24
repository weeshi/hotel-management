# todo_v10.md — المرحلة 5: التشغيل المتقدم (Operations Pro)

> الحالة: جزئي 🔄 — آخر تحديث: 2026-10-24

## Part 1 — تحسينات Tape Chart + قائمة الحجوزات بانتظار التخصيص (v9.3) ✅
- [x] مرشّح `q` (اسم الضيف أو رقم الحجز، `contains` بلا حساسية حالة الأحرف)
- [x] مرشّح `roomTypeId` (تصفية الغرف والحجوزات حسب نوع الغرفة)
- [x] مرشّح `floor` (تصفية الغرف حسب الطابق)
- [x] مرشّح `status` (حالة غرفة أو حالة حجز حسب القيمة)
- [x] `unassignedBookings`: كل `BookingRoom.roomId = null` لحجوزات CONFIRMED/PENDING ضمن النافذة
- [x] `filterOptions`: أنواع الغرف + الطوابق الفريدة لبناء القوائم في الواجهة
- [x] شرائط تصفية فوق الشبكة (بحث + نوع الغرفة + الطابق + الحالة)
- [x] «قائمة الحجوزات بانتظار التخصيص» — نقر يفتح `AssignRoomModal`
- [x] سحب وإفلات مباشر من القائمة إلى شبكة الغرف (`POST /assign-room` عبر `apiPost` + CSRF)
- [x] زر طباعة/تصدير (`window.print()`) + `@media print` ورقة أفقية تُظهر الشبكة فقط
- [x] `tests/integration/tape-chart-pro.test.ts` (6/6)

## Part 2 — التقرير الموحّد للمجموعات (v9.4) ✅
- [x] `GroupBookingService.getGroupReport(groupId, hotelId)` مُنمّط بقوة
- [x] ملخص الإشغال: حجوزات نشطة/ملغاة + توزيع الحالات + غرف مخصّصة/بانتظار التخصيص + ليالٍ غرف + ضيوف
- [x] الملخص المالي: رئيسية/فرعية/موحّدة + `chargesByCategory` + `paymentsByMethod` (صافي المرتجعات)
- [x] `memberBreakdown` لكل حجز + قواعد التوجيه
- [x] مسار `GET /api/admin/group-bookings/[id]/report` (ADMIN/MANAGER/RECEPTION/ACCOUNTANT)
- [x] `GroupReportModal` + زر «📊 تقرير المجموعة الموحّد» + طباعة التقرير
- [x] `tests/integration/group-booking-report.test.ts` (7/7)

## Part 2.1 — تحصين التقرير الموحّد (v9.4.1) ✅
- [x] حارس دورة حياة المجموعة: `GROUP_BOOKING_STATUSES` + `GroupBookingStatus` + `groupBookingStatusSchema` (Zod)
- [x] تحقق `safeParse` إلزامي في `GroupBookingService.create` (اسم غير فارغ + حالة ضمن القيد) → `ValidationError` 422
- [x] استبعاد فواتير `VOID` وفواتير الحجوزات الملغاة معدومة النشاط من `subFoliosTotals`/الفئات/المدفوعات/الإجمالي الموحّد مع الحفاظ على رسوم جزاء الإلغاء غير الملغاة
- [x] `tests/integration/group-booking-report.test.ts` (11/11 — +4 اختبارات تحصين)
- [x] توثيق `docs/PRD.md` (المرجع الأعلى) + ربطه أعلى `README.md`

## Part 3 — الفوترة الشهرية الآجلة للشركات (Corporate Billing — v9.5) ✅
- [x] توسيع `Invoice`: `status`/`periodStart`/`periodEnd`/`dueDate`/`paidAt`/`subtotal`/`taxAmount`/`paidAmount`/`notes`/`items`/`updatedAt` (+ `prisma db push` + `generate`)
- [x] `CorporateBillingService.generateMonthlyStatement` — تجميع آلي للفواتير غير المفوترة + بنود صريحة `lineItems` + `CORP-YYYYMM-XXXX`
- [x] `CorporateBillingService.recordInvoicePayment` — قفل `FOR UPDATE` + منع الزائد/`PAID`/`VOID` + تحول تلقائي إلى `PAID`/`paidAt`
- [x] `CorporateBillingService.getClientStatement` — كشف حساب + `totalInvoiced`/`totalPaid`/`outstandingBalance`/`overdueBalance`
- [x] المسارات: `GET|POST /api/admin/external-clients/[id]/invoices` و`POST .../[invoiceId]/pay` (+ CSRF + أدوار)
- [x] `tests/integration/corporate-billing.test.ts` (10/10)
- [x] تنظيف `resetDb` بإضافة `externalClient` قبل حذف الفنادق

## Part 4 — لوحة القيادة التنفيذية USALI-style (Executive KPIs — v9.6) ✅
- [x] `parseTripoliWindow` — أيام تقويمية **شاملة النهاية** بتوقيت `Africa/Tripoli` (`endDayExclusive = endDayIndex + 1`) + رفض النطاق المعكوس
- [x] عدّ ليالٍ بفرق مؤشرات الأيام التقويمية (`overlapEndDay − overlapStartDay`) بدل `Math.ceil` الزمني
- [x] قاعدة الحالة: `CHECKED_IN`/`CHECKED_OUT` فقط (استبعاد `CONFIRMED`)
- [x] `ExecutiveKpiService.getExecutiveKpis` — جرد الغرف + إشغال استحقاقي `accruedRoomRevenue` (ADR/RevPAR/Occupancy) + `isOverbooked`
- [x] اكتمال الدفتر: `CHARGE`/`DISCOUNT`/`REFUND` مع دمج عكس الإيراد في فئته الأصلية (واستبعاد استرداد الدفعات)
- [x] فصل الضريبة (`netRevenue`/`taxTotal`/`grossBilled`) + `totalCollected`/`collectionRate` مع استبعاد `VOID`
- [x] تقييد الفترة الجزئية عند اليوم (`effectiveEndDate`/`isPartialPeriod`) + شارة «فترة جزئية» في الواجهة
- [x] `revenueByCategory` + تنبيهات (`pendingWebBookings`/`unassignedBookingRooms`)
- [x] `GET /api/admin/reports/executive-kpis` (ADMIN/MANAGER/ACCOUNTANT) + نافذة افتراضية Month-to-Date
- [x] `ExecutiveKpiPanel` مدمجة في `/admin/reports` (تسميات Accrued / Billed Ledger / نسبة تحصيل الفترة)
- [x] `tests/integration/executive-kpi.test.ts` (21/21 — يشمل اصطلاح إشارة الإلغاء، استرداد الدفعة، مطابقة الاستحقاق/الدفتر، والفترة الجزئية)
- [x] تنظيف `resetDb`: `refund` قبل `payment` + `safeBoxTransaction`/`safeDepositBoxItem`/`safeDepositBox`

## بوابة التحقق (Part 2 + Part 2.1 + Part 3 + Part 4)
- [x] `npx tsc --noEmit` نظيف
- [x] `npx vitest run tests/integration/group-booking-report.test.ts` — 11/11
- [x] `npx vitest run tests/integration/corporate-billing.test.ts` — 10/10
- [x] `npx vitest run tests/integration/executive-kpi.test.ts` — 21/21
- [x] `npx next lint` (صفر أخطاء)
- [x] `npx vitest run` (الحزمة الكاملة) — 35 ملفاً / 341 اختباراً أخضر
- [x] تحديث `README.md` (Roadmap + API + Changelog) و`docs/PRD.md`

## متبقٍ من المرحلة 5 — التشغيل المتقدم
- [ ] نظام التنبيهات والإشعارات المتقدمة
- [ ] دعم محركات حجز إضافية في التكامل الخارجي (normalizers جديدة)
