# 🏨 نظام إدارة الفنادق v3.1 — Hotel Management System

منصة متكاملة لإدارة الفنادق مع حجوزات، محفظة نقدية (Wallet)، فوترة فندقية (Folio Billing)، بوابات دفع إلكترونية، صندوق أمانات (Safe Deposit)، مطعم (POS)، تدبير منزلي (Housekeeping)، مكتب مفقودات (Lost & Found)، حجوزات مجموعات (Group Bookings)، Tape Chart تفاعلي، محرك مالي متكامل، و API للربط مع المنظومات العالمية.

> **الفرع الحالي:** `fix/qa-round-1`
> **البوابة:** `http://localhost:3001`
> **قاعدة البيانات:** PostgreSQL `localhost:5432/hotel_management`

---

## 🚀 التشغيل السريع

### المتطلبات
- Node.js 20+
- Docker Desktop
- npm 10+

### 1. تشغيل قاعدة البيانات
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
يفتح على: **http://localhost:3001**

### أوامر مفيدة
| الأمر | الوصف |
|-------|--------|
| `npm run dev` | تشغيل التطبيق (منفذ 3001) |
| `npm run build` | بناء التطبيق للإنتاج |
| `npm test` | تشغيل اختبارات الوحدة (Vitest) |
| `npm run typecheck` | التحقق من الأنواع (TypeScript) |
| `npm run lint` | فحص الكود (ESLint) |
| `npm run db:studio` | فتح Prisma Studio |
| `npm run db:migrate` | إنشاء ترحيل جديد لقاعدة البيانات |

### حسابات الاختبار
| البريد | كلمة المرور | الصلاحية |
|--------|------------|----------|
| admin@hotel.com | admin123 | مدير النظام (Admin) |
| reception@test.com | TestPass123 | موظف استقبال (Reception) |

---

## 📁 هيكل المشروع

```
hotel-management/
├── apps/web/                    ← Next.js (Frontend + API Routes)
│   ├── prisma/
│   │   ├── schema.prisma        ← 45+ نموذج بيانات
│   │   ├── migrations/          ← ترحيلات
│   │   └── seed.ts
│   ├── src/
│   │   ├── app/
│   │   │   ├── (public)/        ← موقع العملاء (حجز عام)
│   │   │   ├── (dashboard)/
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
│   │   │   ├── gateways/        ← بوابات الدفع (Stripe, MobiCash, Email)
│   │   │   ├── queue/           ← طابور المهام
│   │   │   ├── repositories/    ← طبقة الوصول للبيانات (3)
│   │   │   ├── services/        ← منطق الأعمال (12)
│   │   │   └── utils/           ← أدوات مساعدة (CSRF, Toast, API Client)
│   │   ├── middlewares/         ← Auth, CSRF, Rate Limit, Validate
│   │   └── middleware.ts        ← Next.js Edge Middleware
│   └── tests/
│       ├── unit/                ← 4 ملفات اختبار وحدة
│       └── integration/         ← 4 ملفات اختبار تكامل
├── packages/shared/             ← أنواع مشتركة + Zod schemas + Enums + Permissions
├── docker-compose.yml           ← PostgreSQL + Redis
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
PostgreSQL + Redis (تخزين مؤقت)
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
- دفع (Stripe, MobiCash, Wallet, Cash)
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

### 💳 بوابات الدفع

| البوابة | الحالة |
|---------|--------|
| Stripe | ✅ كامل |
| موبي كاش (Libyana) | ✅ كامل |
| محفظة داخلية (Wallet) | ✅ كامل |
| نقدي (Cash) | ✅ كامل |
| PayPal | 📅 milestone |
| إدفع لي | 📅 milestone |
| يسر باي | 📅 milestone |
| ون باي | 📅 milestone |

### 🔐 طبقات الأمان

1. **النقل**: HTTPS + Helmet.js
2. **المصادقة**: JWT + Refresh Token Rotation
3. **الصلاحيات**: RBAC (Admin, Manager, Reception, Housekeeping, Maintenance, Restaurant, Accountant)
4. **الحماية**: CSRF Token + Rate Limiting + Zod Validation
5. **المراقبة**: Audit Log (تتبع كل عملية)
6. **الشركاء**: API Key + HMAC + IP Whitelist
7. **الجلسات**: Session Management + Self-Healing Auth

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
- [ ] دعم المزيد من بوابات الدفع (PayPal, إدفع لي, يسر باي, ون باي)

### المرحلة 6 — التكامل الخارجي (External Integration) 📅
- [ ] Channel Manager API (توزيع الغرف على OTAs)
- [ ] تكامل محاسبي (Integration with accounting systems)
- [ ] PMS API للربط مع الأنظمة العالمية
- [ ] نظام الحجوزات الجماعية (Wholesale / Travel Agents)
- [ ] تطبيق موبايل (React Native)

### المرحلة 7 — الذكاء والإحصائيات (Analytics & AI) 📅
- [ ] لوحة تحليلات متقدمة (Power BI / Metabase)
- [ ] تنبؤ بالإشغال (Occupancy Forecasting)
- [ ] تسعير ديناميكي (Dynamic Pricing Engine)
- [ ] تقارير ذكية مع توصيات

---

## 📊 API Endpoints

### المصادقة (Auth)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| POST | /api/auth/login | تسجيل الدخول |
| POST | /api/auth/register | تسجيل مستخدم جديد |
| POST | /api/auth/refresh | تحديث التوكن |
| GET | /api/auth/csrf | الحصول على CSRF token |

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
| GET | /api/public/bookings | حجوزات عامة |
| POST | /api/public/bookings | إنشاء حجز عام |

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
| POST | /api/payments/create | إنشاء عملية دفع |
| GET | /api/admin/payments | قائمة المدفوعات |
| POST | /api/admin/payments/[id]/refund | استرداد مبلغ |

### النزلاء (Guests)
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| GET | /api/admin/guests | قائمة النزلاء |
| POST | /api/admin/guests | إنشاء نزيل |
| GET | /api/admin/guests/[id] | تفاصيل نزيل |
| PATCH | /api/admin/guests/[id] | تحديث نزيل |
| GET | /api/admin/guests/[id]/folio | فواتير النزيل |
| GET | /api/admin/guests/[id]/wallet | محفظة النزيل |
| GET | /api/admin/guests/search | بحث عن نزيل |

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
| الطريقة | المسار | الوصف |
|--------|--------|-------|
| POST | /api/webhooks/stripe | Webhook Stripe |
| POST | /api/webhooks/mobicash | Webhook موبي كاش |

---

## 🧪 الاختبارات

```bash
# اختبارات الوحدة + التكامل (8 ملفات — ✅)
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
│   ├── errors.test.ts
│   ├── shared-schemas.test.ts
│   └── password.test.ts
├── integration/
│   ├── auth.service.test.ts
│   ├── booking.service.test.ts
│   ├── folio.service.test.ts
│   └── e2e-wallet-pos-folio.test.ts
├── helpers/
│   └── db.ts
└── setup.ts
```

---

## 📜 سجل التغييرات (Changelog)

| التاريخ | الإصدار | أبرز التغييرات |
|---------|---------|----------------|
| 2026-07-17 | v3.1 | المرحلة 4: نقل غرفة، تمديد إقامة، سياسات إلغاء، حجوزات مجموعات، Tape Chart + محرك مالي + checkout strictness |
| 2026-07-17 | v3.0 | QA Round 1: 7 إصلاحات + توثيق شامل + نشر GitHub |
| 2026-07-16 | v2.5 | إضافة Guest, Wallet, POS, Safe Deposit, Lost & Found, Reports |
| 2026-07-15 | v2.0 | إدارة الحجوزات الكاملة، Folio Billing، Check-in/Check-out |
| 2026-07-07 | v1.0 | MVP: هيكل المشروع، المصادقة، الغرف، الفوترة الأساسية |

---

## 📁 ملفات التخطيط (Todo Files)

| الملف | الوصف |
|-------|-------|
| `todos.md` | ملاحظات عامة (لا يُستخدم للمراحل الرئيسية) |
| `todo_v4.md` | المرحلة 4: الكمال التشغيلي — نقل غرفة، تمديد، إلغاء، مجموعات، Tape Chart (مكتمل ✅) |

---

> **ملاحظة:** هذا المشروع يستخدم Prisma مع PostgreSQL. تأكد من تشغيل Docker قبل بدء التطوير.
