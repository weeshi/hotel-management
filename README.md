# 🏨 نظام إدارة الفنادق v2.0

منصة متكاملة لإدارة الفنادق مع حجوزات، فوترة فندقية (Folio Billing)، بوابات دفع إلكترونية، و API للربط مع المنظومات العالمية.

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
npx prisma migrate dev --name init
npx prisma db seed
```

### 4. تشغيل التطبيق
```bash
npm run dev
```
يفتح على: http://localhost:3000

### حسابات الاختبار
| البريد | كلمة المرور | الصلاحية |
|--------|------------|----------|
| admin@hotel.com | admin123 | مدير النظام (Admin) |
| reception@hotel.com | reception123 | موظف استقبال (Reception) |

---

## 📁 هيكل المشروع

```
hotel-management/
├── apps/web/              ← Next.js (Frontend + API Routes)
│   ├── prisma/            ← Prisma schema + migrations
│   ├── src/
│   │   ├── app/           ← الصفحات (Pages Router)
│   │   │   ├── (public)/  ← موقع العملاء
│   │   │   ├── (dashboard)/ ← لوحة التحكم
│   │   │   └── api/       ← API Routes
│   │   ├── components/    ← المكونات
│   │   ├── lib/
│   │   │   ├── gateways/  ← بوابات الدفع (Stripe, MobiCash)
│   │   │   ├── repositories/ ← طبقة الوصول للبيانات
│   │   │   ├── services/  ← منطق الأعمال
│   │   │   └── utils/     ← أدوات مساعدة
│   │   ├── middleware/    ← Auth, CSRF, Rate Limiting
│   │   └── styles/        ← CSS
│   └── tests/
├── packages/shared/       ← أنواع مشتركة + Zod schemas
├── docker-compose.yml     ← PostgreSQL + Redis
└── package.json           ← Monorepo (npm workspaces)
```

## 🏗️ العمارة

```
HTTP/HTTPS
    ↓
Next.js API Routes (بديل Express)
    ↓
Middleware (Auth → CSRF → Rate Limiter → Validation → Audit)
    ↓
Service Layer (منطق الأعمال)
    ↓
Repository Layer (Prisma ORM)
    ↓
PostgreSQL + Redis
```

## 💳 بوابات الدفع

| البوابة | الحالة |
|---------|--------|
| Stripe | ✅ MVP |
| موبي كاش (Libyana) | ✅ MVP |
| PayPal | 📅 مرحلة 3 |
| إدفع لي | 📅 مرحلة 3 |
| يسر باي | 📅 مرحلة 3 |
| ون باي | 📅 مرحلة 3 |

## 🔐 طبقات الأمان

1. **النقل**: HTTPS + Helmet.js
2. **المصادقة**: JWT + Refresh Token Rotation + 2FA
3. **الصلاحيات**: RBAC (Admin, Manager, Reception)
4. **الحماية**: CSRF + Rate Limiting + Zod Validation
5. **المراقبة**: Audit Log
6. **الشركاء**: API Key + HMAC + IP Whitelist
7. **الجلسات**: Session Management + Login Alert

## 🗺️ خريطة التنفيذ

### المرحلة 1 — MVP (8-10 أسابيع) ✅
- [x] هيكل المشروع + Docker + Prisma
- [x] المصادقة والأمان (JWT + RBAC)
- [x] إدارة الغرف والحجوزات الأساسية
- [x] نظام الفوترة (Folio Billing)
- [x] الدفع: Stripe + موبي كاش
- [ ] اختبارات وحدة + تكامل
- [ ] نشر تجريبي

### المرحلة 2 — تعزيز (4-6 أسابيع)
- [ ] حجوزات متعددة الغرف
- [ ] الأسعار الموسمية (Rate Plans)
- [ ] سياسات الإلغاء مع استرداد
- [ ] الإشعارات (Email + SMS)
- [ ] التدبير المنزلي
- [ ] التقارير الأساسية

### المرحلة 3 — إطلاق (4-6 أسابيع)
- [ ] 2FA
- [ ] PayPal + بوابات ليبية إضافية
- [ ] فواتير PDF
- [ ] Partner API
- [ ] Channel Manager

## 📊 API Endpoints

| الطريقة | المسار | الوصف |
|--------|--------|-------|
| POST | /api/auth/login | تسجيل الدخول |
| POST | /api/auth/refresh | تحديث التوكن |
| GET | /api/admin/bookings | قائمة الحجوزات |
| POST | /api/admin/bookings | إنشاء حجز جديد |
| GET | /api/admin/rooms | قائمة الغرف |
| POST | /api/admin/rooms | إنشاء غرفة جديدة |
| POST | /api/payments/create | إنشاء عملية دفع |
| POST | /api/webhooks/stripe | Webhook Stripe |
| POST | /api/webhooks/mobicash | Webhook موبي كاش |
