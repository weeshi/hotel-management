# دليل التثبيت والتشغيل — نظام إدارة الفنادق

> الإصدار: **v8.5** (الفرع: `release/V3.12-Updates`)
> البوابة: **http://localhost:3210**
> قاعدة البيانات: **PostgreSQL** `localhost:5432/hotel_management` + **Redis** `localhost:6379`

هذا هو الدليل الرئيسي. اختر الدليل المخصص لنظام التشغيل لديك:

| نظام التشغيل | الدليل |
|--------------|--------|
| 🪟 Windows | [installation-windows.md](./installation-windows.md) |
| 🐧 Linux (Ubuntu/Debian/RHEL) | [installation-linux.md](./installation-linux.md) |
| 🍎 macOS | [installation-macos.md](./installation-macos.md) |

---

## المتطلبات العامة (كل المنصات)

| المتطلب | الإصدار الموصى به | ملاحظات |
|---------|-------------------|---------|
| **Node.js** | 20+ (المشروع تلقائي `^22.17`) | الأحدث LTS |
| **npm** | 10+ | يأتي مع Node.js |
| **Docker Desktop** | 20+ | لتشغيل PostgreSQL + Redis |
| أو **PostgreSQL حرفي** | 16+ | بديل لـ Docker |

> **ملاحظة عن Redis:** الـ Redis موجود ضمن `docker-compose.yml` وهو **مطلوب الآن** لطوابير BullMQ (Channel Manager، المهام غير المتزامنة).

---

## هيكل المشروع (Monorepo)

```
hotel-management/
├── apps/web/                ← تطبيق Next.js (واجهة + API Routes)
│   ├── prisma/              ← schema + migrations + seed
│   └── src/                 ← الكود (صفحات، مكوّنات، خدمات، مسارات API)
├── packages/shared/         ← الأنواع المشتركة + Zod schemas + Enums + صلاحيات
├── docker-compose.yml       ← PostgreSQL + Redis (+ pgAdmin اختياري)
├── package.json             ← Monorepo (npm workspaces + Turborepo)
└── .env.example             ← قالب متغيرات البيئة
```

---

## خطوات التثبيت العامة

الخطوات التالية مشتركة بين المنصات (الفرق فقط في أداة تثبيت المتطلبات — انظر دلائل كل نظام).

### 1. تشغيل قاعدة البيانات (PostgreSQL + Redis)

**بالخيار A — عبر Docker:**
```bash
docker compose up -d
```
يُشغّل:
- `postgres` على المنفذ `5432` (المستخدم `hotel` / كلمة السر `hotel_dev_2026` / قاعدة `hotel_management`)
- `redis` على المنفذ `6379` (**مطلوب** لطوابير BullMQ)
- `pgadmin` على المنفذ `5050` (يتطلب profile `dev`)

**بالخيار B — PostgreSQL حرفي:**
1. ثبت PostgreSQL 16+ وأشئ قاعدة بيانات باسم `hotel_management`.
2. أنشئ مستخدمًا/صلاحيات تسمح بالاتصال عبر السلسلة في `.env`.

### 2. تثبيت الاعتماديات

```bash
npm install
```

> إذا واجهت مشكلة في تنزيل محركات Prisma من `binaries.prisma.sh` (شبكاتٌ محجوبة)، استخدم:
> ```bash
> npm ci --ignore-scripts
> npx prisma generate
> ```

### 3. إعداد متغيرات البيئة

```bash
# من جذر المشروع
cp .env.example apps/web/.env
```

ثم عدّل `apps/web/.env`:

| المتغير | الوصف |
|---------|-------|
| `DATABASE_URL` | سلسلة اتصال PostgreSQL |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | مفاتيح JWT (≥32 حرفًا) |
| `PAYMENT_CRYPTO_KEY` | مفتاح تشفير 64 حرف hex (32 بايت) — مطلوب منذ v8 |
| `RESEND_API_KEY` | مفتاح البريد (Resend) |
| `NEXT_PUBLIC_APP_URL` | عنوان التطبيق (مثال `http://localhost:3210`) |

### 4. تطبيق المهاجرات (Migrations)

```bash
cd apps/web
npx prisma migrate deploy
```

> `deploy` يطبّق المهاجرات المعلّقة آمنًا دون تفاعل. للعمل اليومي أثناء التطوير استخدم `npx prisma migrate dev`.

### 5. زرع البيانات التجريبية (Seed)

```bash
npm run db:seed
```
أو من جذر المشروع بعد `cd apps/web`:
```bash
npx prisma db seed
```

### 6. تشغيل التطبيق

**وضع التطوير (عادةً ما يشغّله المطوّر):**
```bash
# من جذر المشروع
npm run dev
```
البوابة: **http://localhost:3210**

**تشغيل عامل BullMQ (في ترمينال منفصل):**
```bash
npm run worker:cm
```
هذا يشغّل العامل الوحيد الذي يعالج طوابير التوفر/النشر/الحجوزات/الأسعار/المطابقة (`cm-*`).

**وضع الإنتاج:**
```bash
npm run build && npm run start
```

---

## حسابات الاختبار (بعد الـ seed)

| البريد | كلمة المرور | الصلاحية |
|--------|------------|----------|
| `super@hotel.com` | `superadmin123` | المشرف العام على المنصة (Super Admin) |
| `admin@hotel.com` | `admin123` | مدير النظام |
| `manager@hotel.com` | `123456` | مدير الفندق |
| `reception@hotel.com` | `reception123` | موظف الاستقبال |
| `housekeeping@hotel.com` | `123456` | التدبير المنزلي |
| `maintenance@hotel.com` | `123456` | الصيانة |
| `restaurant@hotel.com` | `123456` | المطعم |
| `accountant@hotel.com` | `123456` | المحاسب |

---

## فحص السلامة (Checklist)

```bash
# 1. التحقق من الأنواع (TypeScript)
npm run typecheck

# 2. تشغيل الاختبارات (الوحدة + التكامل)
npm test

# 3. فحص الكود (ESLint)
npm run lint
```

نتائج متوقعة عند التثبيت السليم:
- `typecheck`: بصفر أخطاء
- `test`: **240 اختبارًا تمر** (24 ملف)
- `lint`: بدون أخطاء حاسمة

> **ملاحظة VCC/PCI-DSS:** النظام يدعم الآن استقبال البطاقات الافتراضية (VCC) من OTAs عبر VGS Tokenization Proxy. لا يتم تخزين أي PAN/CVV في قاعدة البيانات — فقط Tokens. يتطلب الإنتاج حساب VGS وإعداد Forward Proxy.

---

## استكشاف الأخطاء وحلّها

### `binaries.prisma.sh` لا يوحول (شبكة محجوبة)
- المؤشر: فشل `npm install`/`npm ci` عند `@prisma/engines` postinstall مع `ECONNRESET`.
- الحل: `npm ci --ignore-scripts` ثم `npx prisma generate` (يستعيد المحركات من الكاش المتوفر).

### خطأ `column "roomTypeId" already exists` أثناء `migrate deploy`
- يحدث عندما تكون المهاجرة مطبّقة فعليًا في قاعدة البيانات لكن سجلّها مفقود من `_prisma_migrations` (مثل: نقل المشروع من نسخة أقدم).
- الحل: تأكّد أن العمود/القيد/الفهرس موجودة فعلًا، ثم سجّل المهاجرة كمطبّقة:
  ```bash
  npx prisma migrate resolve --applied 20260806000000_bookingroom_roomtype_nullable_roomid
  ```

### المنفذ 3210 مشغول
- غيّر المنفذ مؤقتًا: `next dev --port 3002` أو عدّل `apps/web/package.json`.

### `NEXT_PUBLIC_APP_URL` و `DATABASE_URL`
- تأكد أنهما يطابقان بيئتك (محلي أو مخصص). `DATABASE_URL` يجب أن يطابق إعدادات PostgreSQL.

---

## تشغيل عبر npx مباشرة (للمطوّرين)
من داخل `apps/web`:
| الأمر | الوصف |
|-------|-------|
| `npx prisma studio` | واجهة تصفح قاعدة البيانات |
| `npx prisma migrate dev` | إنشاء ترحيل جديد (تطويري) |
| `npx prisma db push` | مزامنة schema دون مهاجرة (يطابق شيئ ما تبني) |
| `npm run db:seed` | إعادة زرع البيانات |

---

## ملاحظات الأمان

- **لا ترفع** `apps/web/.env` ولا بيانات النزلاء في `apps/web/storage/` إلى git (مستثناة بالفعل في `.gitignore`).
- غيّر مفاتيح JWT و`PAYMENT_CRYPTO_KEY` الافتراضية في الإنتاج.
- لا يوجد تسجيل ذاتي: الحسابات تُنشأ عبر دعوات (Invitations) من الـ Super Admin.
