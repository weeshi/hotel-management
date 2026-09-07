# 🐧 التثبيت والتشغيل على Linux (Ubuntu / Debian / RHEL)

> دليل كامل من الصفر حتى تشغيل الموقع على **http://localhost:3210**.

---

## 1) تثبيت المتطلبات

### Node.js 20+ و npm

**Ubuntu / Debian — عبر NodeSource:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**RHEL / CentOS / Fedora — عبر NodeSource:**
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

تحقق:
```bash
node --version   # 20+
npm --version    # 10+
```

### Git
```bash
sudo apt-get install -y git          # Ubuntu/Debian
sudo yum install -y git              # RHEL/CentOS
```

---

## 2) قاعدة البيانات

**الخيار A — Docker (مبسّط):**
```bash
sudo apt-get install -y docker.io docker-compose   # Ubuntu/Debian
sudo yum install -y docker docker-compose-plugin   # RHEL
sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # ثم سجّل الخروج/الدخول من جديد
```
ثم:
```bash
docker compose up -d
```

**الخيار B — PostgreSQL حرفي (بدون Docker):**

Ubuntu/Debian:
```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "CREATE DATABASE hotel_management;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'hotel_dev_2026';"
```

RHEL/CentOS:
```bash
sudo dnf install -y postgresql-server postgresql-contrib
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "CREATE DATABASE hotel_management;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'hotel_dev_2026';"
```

---

## 3) وضع المشروع + تثبيت الاعتماديات

```bash
cd /path/to/hotel-management
npm install
```

> **مشكلة شائعة على الشبكات المحجوبة:** إذا فشل التثبيت عند `@prisma/engines` بخطأ `ECONNRESET` (توقف تنزيل المحركات من `binaries.prisma.sh`):
> ```bash
> npm ci --ignore-scripts
> npx prisma generate
> ```

---

## 4) إعداد متغيرات البيئة

```bash
cd apps/web
cp ../../.env.example .env
```
ثم عدّل `apps/web/.env` — الأهم `DATABASE_URL` و `NEXT_PUBLIC_APP_URL`.

---

## 5) تطبيق المهاجرات + زرع البيانات

```bash
cd apps/web
npx prisma migrate deploy
npx prisma db seed
```

> إذا ظهر خطأ `column "roomTypeId" already exists` وكانت القاعدة سليمة، فازرع المهاجرة يدويًا:
> ```bash
> npx prisma migrate resolve --applied 20260806000000_bookingroom_roomtype_nullable_roomid
> ```

---

## 6) تشغيل الخادم

**وضع التطوير** (من جذر المشروع):
```bash
cd /path/to/hotel-management
npm run dev
```

**وضع الإنتاج:**
```bash
npm run build
npm run start
```

---

## 7) فحص السلامة

```bash
npm run typecheck
npm test
npm run lint
```

---

## 8) (اختياري) تشغيل كلسكرين الموجودة في الخلفية بـ systemd

أنشئ `/etc/systemd/system/hotel-web.service`:
```ini
[Unit]
Description=Hotel Management Web
After=network.target postgresql.service

[Service]
WorkingDirectory=/path/to/hotel-management
ExecStart=/usr/bin/npm run start
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
ثم:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hotel-web
sudo systemctl status hotel-web
```

---

## مشاكل شائعة على Linux

| المشكلة | الحل |
|---------|------|
| `npm` غير معروف في systemd | استخدم المسار الكامل للـ npm: `which npm` وأدخله في `ExecStart`. |
| رفض اتصال PostgreSQL | تأكد من `pg_hba.conf` يسمح بـ md5/scram المحلي، وعدّل `DATABASE_URL`. |
| المنفذ 3210 مشغول | `sudo ss -tlnp | grep 3210` وغيّر المنفذ في `next.config.js`/الأمر. |
| أخطاء `ECONNRESET` Prisma | استخدم `npm ci --ignore-scripts` ثم `npx prisma generate`. |
| أذونات الـ storage | تأكد أن مجلد `apps/web/storage` قابل للكتابة من قبل مستخدم التشغيل. |
