# 🚢 النشر في بيئة الإنتاج

> دليل النشر لبيئة الإنتاج على أي نظام تشغيل/خادم.
> المتطلبات: Node 20+, PostgreSQL، سرع صغيرة من المفاتيح (secrets سليمة).

---

## نظرة عامة

التطبيق هو **Next.js 14 (تطبيق مُصَدَّر)** مع **خدمة عامل BullMQ مستقلة**. خطوة الإنتاج المعتادة:
```
build → start (web) + worker-cm (background)
```
يعمل `next build` على تجميع التطبيق، ويشغّله `next start` كخادم Node حقيقي (وليس dev). عامل BullMQ يعمل كعملية منفصلة `npm run worker:cm` ويستهلك طوابير Redis.

> **Redis مطلوب في وقت التشغيل** (لطوابير BullMQ). PostgreSQL مطلوب.

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
| `REDIS_URL` | `redis://:PASSWORD@host:6379` (مطلوب لـ BullMQ) |
| `WORKER_CONCURRENCY_SNAPSHOT` | `2` (اختياري — حد التزامن لطابور snapshot) |
| `WORKER_CONCURRENCY_PUBLISH` | `3` (اختياري — حد التزامن لطابور publish) |
| `WORKER_CONCURRENCY_INGEST` | `5` (اختياري — حد التزامن لطابور ingest) |
| `WORKER_CONCURRENCY_RATES` | `2` (اختياري — حد التزامن لطابور rates) |
| `WORKER_CONCURRENCY_RECONCILE` | `1` (اختياري — حد التزامن لطابور reconcile) |
| `VGS_PROXY_URL` | `https://tntxxx.verygoodproxy.com` (VGS Forward Proxy URL) |
| `VGS_VAULT_ID` | `vlt_xxxxx` (VGS Vault ID for tokenization) |
| `VGS_REVEAL_DOMAIN` | `reveal.verygoodsecurity.com` (VGS Reveal Iframe domain) |
| `VGS_MANAGEMENT_API_KEY` | مفتاح VGS Management API (لازم لمهمة الحذف اليومية `purge-vcc` — بدونه تفشل عملية الحذف) |

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

## 4.5) تشغيل عامل BullMQ (Worker)

عامل BullMQ الوحيد (`worker-cm`) يستهلك جميع طوابير `cm-*` ويجب تشغيله كخدمة دائمة بجانب الويب:

**PM2 (موصى به):**
```bash
npm i -g pm2
pm2 start npm --name hotel-worker -- run worker:cm
pm2 save
pm2 startup
```

**systemd (Linux):**
```ini
# /etc/systemd/system/hotel-worker.service
[Unit]
Description=Hotel Management BullMQ Worker
After=network.target redis.service

[Service]
Type=simple
WorkingDirectory=/opt/hotel-management
Environment=NODE_ENV=production
Environment=REDIS_URL=redis://:PASSWORD@localhost:6379
ExecStart=/usr/bin/npm run worker:cm
Restart=always
RestartSec=10
User=hotel

[Install]
WantedBy=multi-user.target
```
```bash
systemctl daemon-reload
systemctl enable --now hotel-worker
```

**Docker Compose (prod profile):**
```yaml
# docker-compose.prod.yml
services:
  worker-cm:
    build:
      context: .
      dockerfile: Dockerfile.worker   # أو استخدم نفس image الويب
    command: npm run worker:cm
    environment:
      - REDIS_URL=redis://:PASSWORD@redis:6379
      - NODE_ENV=production
    depends_on:
      - redis
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
```

> **Healthcheck:** العامل يعرض `/api/health/workers` على المنفذ `PORT` (افتراضي 3211) — استخدمه في systemd/PM2/Docker `healthcheck` للشفاء الذاتي.

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

**الويب (Next.js):**
```bash
curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:3210/api/health
```

**عامل BullMQ (Worker):**
```bash
curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:3211/api/health/workers
```
يعيد JSON `{ status: "ok", redis: "connected", queues: {...} }` — يفيد في systemd/PM2/Docker healthcheck للشفاء الذاتي.

أو تحقق من أي مسار عام (`/`, `/rooms`) يعيد 200.

**أدوات مفيدة:** PM2 (`pm2 logs`), systemd (`journalctl -u hotel-web` / `journalctl -u hotel-worker`), ومراقبات مثل UptimeRobot/Nagios.

---

## أمان الإنتاج — Checklist

- [ ] تغيير جميع المفاتيح الافتراضية في `v .env` (JWT + PAyMENT_CRYPTO_KEY).
- [ ] تشغيل قاعدة البيانات خلف شبكة خاصة (ليست معرّضة للإنترنت).
- [ ] تفعيل HTTPS فقط (redirect من HTTP).
- [ ] حذف `dev`/بيانات تجريبية إن لم تكن مطلوبة.
- [ ] تقييد الوصول إلى `/api` الإدارية عبر المصادقة والصلاحيات.
- [ ] مراجعة أدوار المستخدمين ونفي افتراضي.
- [ ] عزل مجلد `apps/web/storage` (وثائق النزلاء) بأذونات صارمة.

---

## امتثال VCC / PCI-DSS (SAQ A) — Checklist الإنتاج

- [ ] **VGS Proxy**: تم إعداد Forward Proxy على `vgs-proxy.yourdomain.com` مع field mappings صحيحة لـ Booking.com/Expedia
- [ ] **VGS Vault**: تم إنشاء Vault، تم تعيين `VGS_VAULT_ID` في البيئة
- [ ] **Reveal Domain**: `VGS_REVEAL_DOMAIN` مضبوط (افتراضي: `reveal.verygoodsecurity.com`)
- [ ] **No PAN/CVV in DB**: تحقق أن قاعدة البيانات لا تحتوي على حقول PAN/CVV — فقط `vccToken`/`vccExpiryToken`/`vccCVVToken`
- [ ] **Audit Log**: `VCCAuditLog` يسجل `tokenized`/`revealed`/`purged` لكل عملية
- [ ] **Purge Job**: Job يومي يعمل **03:00 Africa/Tripoli** (`daily-vcc-purge-scan`)، يحذف tokens بعد `checkOut + 7 أيام` عبر VGS API ويتطلب `VGS_MANAGEMENT_API_KEY`
- [ ] **SAQ A Attestation**: نموذج SAQ A مكتمل وموقع (VGS يتحمل مسؤولية Vault)
- [ ] **Network Segmentation**: VGS Proxy هو الجهة الوحيدة التي تلمس PAN — خوادم التطبيق لا ترى PAN أبداً
- [ ] **Backup Exclusion**: استبعاد جداول VCC من النسخ الاحتياطية أو تشفير منفصل
