# 🍎 التثبيت والتشغيل على macOS

> دليل كامل من الصفر حتى تشغيل الموقع على **http://localhost:3210**.

---

## 1) تثبيت المتطلبات

### Homebrew (مدير الحزم)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Node.js 20+ و npm
```bash
brew install node
```
تحقق:
```bash
node --version   # 20+
npm --version    # 10+
```

### Git
```bash
brew install git
```

### Docker Desktop (لتشغيل PostgreSQL)
- نزّل من: https://www.docker.com/products/docker-desktop/
- (أو عبر Homebrew: `brew install --cask docker`)
- افتح Docker Desktop مرة على الأقل لتفعيل المحرك.

> **بديل بدون Docker:** `brew install postgresql@16` ثم شغّله وأنشئ قاعدة البيانات:
> ```bash
> brew services start postgresql@16
> createdb hotel_management
> ```

---

## 2) وضع المشروع + تثبيت الاعتماديات

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

## 3) تشغيل قاعدة البيانات (Docker)

```bash
docker compose up -d
```
- `postgres` → `5432` (مستخدم `hotel`, كلمة سر `hotel_dev_2026`, قاعدة `hotel_management`)
- `redis` → `6379` (**مطلوب لـ BullMQ**)
- `pgadmin` → `5050` (يتطلب `--profile dev`)

---

## 4) إعداد متغيرات البيئة

```bash
cd apps/web
cp ../../.env.example .env
```
ثم عدّل `apps/web/.env` — حدّث `NEXT_PUBLIC_APP_URL` إلى `http://localhost:3210` إن أردت، وتأكد من `DATABASE_URL`.

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

## 6) تشغيل التطبيق

**وضع التطوير** (من جذر المشروع):
```bash
cd /path/to/hotel-management
npm run dev
```
ثم افتح المتصفح على: **http://localhost:3210**

**تشغيل عامل BullMQ (في ترمينال منفصل):**
```bash
npm run worker:cm
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

## 8) (اختياري) تشغيل دائم عبر `launchd`

**الويب:**
أنشئ `~/Library/LaunchAgents/com.hotel.web.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.hotel.web</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npm</string>
        <string>run</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key><string>/path/to/hotel-management</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
</dict>
</plist>
```

**عامل BullMQ:**
أنشئ `~/Library/LaunchAgents/com.hotel.worker.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.hotel.worker</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npm</string>
        <string>run</string>
        <string>worker:cm</string>
    </array>
    <key>WorkingDirectory</key><string>/path/to/hotel-management</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>REDIS_URL</key><string>redis://:hotel_redis_2026@localhost:6379</string>
        <key>NODE_ENV</key><string>production</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
</dict>
</plist>
```

ثم:
```bash
launchctl load ~/Library/LaunchAgents/com.hotel.web.plist
launchctl load ~/Library/LaunchAgents/com.hotel.worker.plist
```

---

## مشاكل شائعة على macOS

| المشكلة | الحل |
|---------|------|
| `npm` لا يُعرَف عبر launchd | استخدم المسار الكامل: `which npm` ثم ضعه في `ProgramArguments`. |
| مشاكل بناء وحدات أصلية | ثبّت أدوات سطر الأوامر: `xcode-select --install`. |
| المنفذ 3210 مشغول | `lsof -i :3210` ثم غيّر المنفذ. |
| أخطاء `ECONNRESET` Prisma | استخدم `npm ci --ignore-scripts` ثم `npx prisma generate`. |
| أذونات الـ storage | تأكد أن `apps/web/storage` قابل للكتابة من قبل مستخدم التشغيل. |
