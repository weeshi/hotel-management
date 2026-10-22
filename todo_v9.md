# todo_v9.md — M3/M4: قفل الحصة الذرّي + تخصيص الغرفة + الانتهاء التلقائي (v9.2)

> الحالة: مكتمل ✅ — 2026-10-22

## Task 0 — إزالة مسار العمل القديم
- [x] حذف `C:\Users\Weeshi\hotel-management` (نسخة مطابقة لـ HEAD `4800294`)
- [x] تحديث `git config --global safe.directory` إلى `D:/ERP-Projects/hotel-management`
- [x] التأكد من صفر إشارات للمسار القديم داخل الريبو

## Task 1 — تقارير التدقيق
- [x] حذف `.audit.root.json` و`apps/web/.audit.web.json` من التتبّع
- [x] إضافة `.audit.*.json` إلى `.gitignore`

## Task 2 — M3: قفل الحصة الذرّي
- [x] `ConflictError` (409) في `errors.ts`
- [x] `FOR UPDATE` على `RoomType` داخل `tenantTx` في `BookingService.create`
- [x] إعادة عدّ PENDING WEBSITE + الغرف الفيزيائية داخلياً ورمي 409 عند النفاد

## Task 3 — M4-A: تخصيص الغرفة الفيزيائية
- [x] حارس `checkIn` الصارم (رفض أي `roomId = null` قبل أي طفرة)
- [x] `assignPhysicalRoom` (قفل Room + تعارض تواريخ + تدقيق + PENDING→CONFIRMED)
- [x] `POST /api/admin/bookings/[id]/assign-room` (Zod/CSRF/rate-limit/أدوار)
- [x] `AssignRoomModal` + شارة «بانتظار تخصيص غرفة» + تعطيل زر الدخول

## Task 4 — M4-B: الانتهاء التلقائي
- [x] `runWebBookingExpiryScan` — PLATFORM للجرد ثم TENANT لكل فندق
- [x] إلغاء + VOID للفاتورة النشطة بصفر مدفوع + `AUTO_EXPIRE_WEB_BOOKING`
- [x] جدولة `hourly-web-booking-expiry` ساعياً + dispatch في `reconcileInventoryProcessor`

## Task 5 — الاختبارات والبوابات
- [x] `tests/integration/public-booking-m3-m4.test.ts` (5/5)
- [x] `tsc --noEmit` نظيف
- [x] `next lint` (صفر أخطاء)
- [x] `npx vitest run` — 31 ملفاً / 293 اختباراً
- [x] تحديث `README.md` (API + Changelog + Architectural Insights)
