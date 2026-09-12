# 🪟 التثبيت والتشغيل على Windows

> دليل كامل من الصفر حتى تشغيل الموقع على **http://localhost:3210**.

---

## 1) تثبيت المتطلبات

### Node.js + npm
1. نزّل أحدث إصدار LTS من: https://nodejs.org
2. شغّل المثبّت وتأكد أن خيار **"Add to PATH"** محدد.
3. تحقق:
```powershell
node --version   # يجب أن يكون 20+
npm --version    # يجب أن يكون 10+
```

### Git (اختياري لكن موصى به)
- نزّل من: https://git-scm.com/download/win
- استخدم الإعدادات الافتراضية.

### Docker Desktop (لتشغيل PostgreSQL)
1. نزّل من: https://www.docker.com/products/docker-desktop/
2. ثبّت وأعد تشغيل النظام.
3. ابدأ Docker Desktop من قائمة ابدأ وتأكد أن العجل يدور (الحالة "Engine running").
4. تحقق في PowerShell:
```powershell
docker --version
docker compose version
```

> **بديل بدون Docker:** ثبّت PostgreSQL مباشرة من https://www.postgresql.org/download/windows/ وأنشئ قاعدة `hotel_management`، ثم عدّل `DATABASE_URL` في `.env` لتطابق إعداداتك.

---

## 2) وضع المشروع في مكانه

افتح **PowerShell** من مجلد المشروع:
```powershell
cd D:\ERP-Projects\hotel-management
```

---

## 3) تشغيل قاعدة البيانات

**مع Docker:**
```powershell
docker compose up -d
```
- `postgres` → المنفذ `5432` (مستخدم `hotel`, كلمة سر `hotel_dev_2026`, قاعدة `hotel_management`)
- `redis` → `6379` (**مطلوب** لطوابير BullMQ)
- `pgadmin` → `5050` (يتطلب `docker compose --profile dev up -d`)

**تحقق أن postgres جاهز:**
```powershell
docker ps
```
يجب أن ترى الحاوية `hotel-postgres` بحالة (healthy).

---

## 4) تثبيت الاعتماديات

```powershell
npm install
```

> **مشكلة معروفة في Windows/الشبكات المحجوبة:** إذا فشل التثبيت عند `@prisma/engines` بخطأ `ECONNRESET` (لأنه ينزّل من `binaries.prisma.sh`)، استخدم:
> ```powershell
> npm ci --ignore-scripts
> npx prisma generate
> ```

---

## 5) إعداد متغيرات البيئة

**في PowerShell** (المجلد `apps/web`):
```powershell
cd apps/web
Copy-Item ..\..\.env.example .env
```
ثم افتح `apps/web/.env` بمعالج نصوص وعدّل القيم المناسبة (حدّث `NEXT_PUBLIC_APP_URL` إلى `http://localhost:3210` إن أردت).

---

## 6) تطبيق المهاجرات + زرع البيانات

من داخل `apps/web`:
```powershell
npx prisma migrate deploy
npx prisma db seed
```

> إذا ظهر خطأ `column "roomTypeId" already exists` وكنت متأكدًا أن قاعدة البيانات سليمة، فعّل المهاجرة المعلّقة يدويًا:
> ```powershell
> npx prisma migrate resolve --applied 20260806000000_bookingroom_roomtype_nullable_roomid
> ```

---

## 7) تشغيل التطبيق

**وضع التطوير** (من جذر المشروع `D:\ERP-Projects\hotel-management`):
```powershell
npm run dev
```
ثم افتح المتصفح على: **http://localhost:3210**

**تشغيل عامل BullMQ (في نافذة PowerShell منفصلة):**
```powershell
npm run worker:cm
```
هذا يشغّل العامل الوحيد الذي يعالج طوابير التوفر/النشر/الحجوزات/الأسعار/المطابقة.

**وضع الإنتاج:**
```powershell
npm run build
npm run start
```

---

## 8) فحص السلامة (اختياري)

```powershell
npm run typecheck
npm test
npm run lint
```

---

## مشاكل شائعة على Windows

| المشكلة | الحل |
|---------|------|
| `npm` غير معروف | أعد فتح PowerShell بعد تثبيت Node.js، أو تحقق من PATH. |
| Docker لا يعمل | تأكد أن "Engine running" وأن لديك صلاحية مسؤول WSL2/وHyper-V. |
| المنفذ 3210 محجوب | `netstat -ano | Select-String "3210"` ثم غيّر المنفذ: `next dev --port 3211`. |
| أخطاء `ECONNRESET` مع Prisma | استخدم `npm ci --ignore-scripts` ثم `npx prisma generate`. |
| سكربت `*.sh` غير معروف | استخدم أوامر PowerShell أعلاه، لا تستخدم أوامر Bash من دليل لينكس. |
