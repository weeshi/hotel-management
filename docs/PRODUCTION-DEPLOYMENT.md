# 🚢 النشر في بيئة الإنتاج

> دليل النشر لبيئة الإنتاج على أي نظام تشغيل/خادم.
> المتطلبات: Node 20+, PostgreSQL، سرع صغيرة من المفاتيح (secrets سليمة).

---

## نظرة عامة

التطبيق هو **Next.js 14 (تطبيق مُصَدَّر)**. خطوة الإنتاج المعتادة:
```
build → start
```
يعمل `next build` على تجميع التطبيق، ويشغّله `next start` كخادم Node حقيقي (وليس dev).

> لا توجد حاجة لـ Redis في وقت التشغيل. PostgreSQL مطلوب.

---

## 1) متغيرات البيئة (إنتاج)

انشئ `apps/web/.env.local` (أو اعدّل `.env`) بقيم الإنتاج:

| المتغير | قيمة إنتاج موصى بها |
|---------|---------------------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | سلسلة اتصال PostgreSQL (يدعم SSL في السحابات) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | مفاتيح عشوائية قوية (≥32 حرف) |
| `PAYMENT_CRYPTO_KEY` | 64 حرف hex (32 بايت) — لتشفير مفاتيح تكامل النظام |
| `RESEND_API_KEY` | مفتاح بريدك الفعلي (لإشعارات الدعوات/الحجوزات) |
| `NEXT_PUBLIC_APP_URL` | العنوان العام الفعلي (مثال `https://hotel.example.com`) |

> **قاعدة ذهبية:** `NEXT_PUBLIC_*` تُبنى داخل الحزمة وقت `build`، لذلك لا تغيّرها بعد البناء — حدّدها قبل `next build`.

---

## 2) بناء وإطلاق

من جذر المشروع:
```bash
npm ci
npx prisma migrate deploy        # طبّق المهاجرات بأمان (بلا تفاعل)
npm run build
npm run start                    # يخدّم على المنفذ 3210 افتراضيًا
```

> **مشكلة شائعة على الشبكات المحجوبة:** إذا فشل `npm ci` عند `@prisma/engines` بخطأ `ECONNRESET`:
> ```bash
> npm ci --ignore-scripts
> npx prisma generate
> ```

---

## 3) زراعة بيانات البداية (مرة واحدة فقط)

على قاعدة إنتاج **فارغة**، أبقها مكررة الحيوية:
```bash
cd apps/web
npx prisma db seed
```
> لا تشغّل الـ seed على قاعدة بها بيانات فعلية لأنها تخلق بيانات تجريبية.

---

## 4) تشغيل دائم (خادم حقيقي)

التطبيق عملية Node أمامها بروكسي عكسي (nginx/Caddy) ومعالج SSL.

**nginx — reverse proxy:**
```nginx
server {
    listen 80;
    server_name hotel.example.com;
    location / {
        proxy_pass http://127.0.0.1:3210;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**إدارة العملية عبر نظام التشغيل:**
- **Linux:** نظام `systemd` — انظر `installation-linux.md` §8.
- **macOS:** `launchd` — انظر `installation-macos.md` §8.
- **Windows / عمومي:** أو استخدم مدير عمليات Node مثل **PM2**:
  ```bash
  npm i -g pm2
  pm2 start npm --name hotel-web -- run start
  pm2 save
  pm2 startup
  ```

---

## 5) مصادقة TLS/SSL

- استخدم **Caddy** (يحصل على شهادات تلقائيًا):
  ```caddyfile
  hotel.example.com {
      reverse_proxy 127.0.0.1:3210
  }
  ```
- أو **Let's Encrypt + nginx** (`certbot --nginx -d hotel.example.com`).

---

## 6) النسخ الاحتياطي

**PostgreSQL** (تكرار يومي عبر cron/systemd timer):
```bash
pg_dump -U hotel hotel_management | gzip > /backup/hotel_$(date +%F).sql.gz
```
- الصق `pg_dump` عبر `fsck` مرة أسبوعيًا.
- احتفظ بالنسخ خارج نفس القرص المادي.

---

## 7) مراقبة الصحة

نقطة صحية سريعة (محمية للداخل):
```bash
curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:3210/api/health
```
أو تحقق من أي مسار عام (`/`, `/rooms`) يعيد 200.

**أدوات مفيدة:** PM2 (`pm2 logs`), systemd (`journalctl -u hotel-web`), ومراقبات مثل UptimeRobot/Nagios.

---

## أمان الإنتاج — Checklist

- [ ] تغيير جميع المفاتيح الافتراضية في `v .env` (JWT + PAyMENT_CRYPTO_KEY).
- [ ] تشغيل قاعدة البيانات خلف شبكة خاصة (ليست معرّضة للإنترنت).
- [ ] تفعيل HTTPS فقط (redirect من HTTP).
- [ ] حذف `dev`/بيانات تجريبية إن لم تكن مطلوبة.
- [ ] تقييد الوصول إلى `/api` الإدارية عبر المصادقة والصلاحيات.
- [ ] مراجعة أدوار المستخدمين ونفي افتراضي.
- [ ] عزل مجلد `apps/web/storage` (وثائق النزلاء) بأذونات صارمة.
