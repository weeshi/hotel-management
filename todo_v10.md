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

## بوابة التحقق (Part 2 + Part 2.1)
- [x] `npx tsc --noEmit` نظيف
- [x] `npx vitest run tests/integration/group-booking-report.test.ts` — 11/11
- [x] `npx next lint` (صفر أخطاء)
- [x] `npx vitest run` (الحزمة الكاملة) — 33 ملفاً / 310 اختباراً أخضر
- [x] تحديث `README.md` (Roadmap + API + Changelog)

## متبقٍ من المرحلة 5 — التشغيل المتقدم
- [ ] أتمتة الفوترة الشهرية للشركات (Corporate Billing) لكل `ExternalClient`
- [ ] لوحة قيادة متقدمة مع مؤشرات الأداء
- [ ] نظام التنبيهات والإشعارات المتقدمة
- [ ] دعم محركات حجز إضافية في التكامل الخارجي (normalizers جديدة)
