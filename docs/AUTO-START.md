# 🔄 الإقلاع التلقائي للخادم

> دليل تشغيل الخادم تلقائيًا مع تشغيل/تسجيل دخول النظام.

---

## نظرة عامة

| المنصة | الطريقة | متى يعمل | يطلب صلاحيات مدير |
|--------|---------|----------|-------------------|
| **ويندوز** | مجلد التشغيل (Startup folder) | تسجيل الدخول | ❌ لا |
| **ويندوز** | مهمة مجدولة (Scheduled Task) | بدء تشغيل النظام | ✅ نعم |
| **لينكس** | systemd service | بدء تشغيل النظام | ✅ نعم |

---

## ويندوز — الطريقة الأولى (مجلد التشغيل — بدون مدير)

هذا هو الأسهل والأكثر أمانًا لجهاز المطوّر:

### التشغيل
```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-windows-startup.ps1
```
يُثبّت ملف `HotelManagement.vbs` في مجلد التشغيل التلقائي (`shell:startup`). عند تسجيل الدخول التالي، يبدأ الخادم **صامتًا** (بدون نافذة cmd) على المنفذ 3210.

### التحقق
افتح `shell:startup` في مستكشف الملفات (Win+R ثم `shell:startup`). يجب أن ترى:
```
HotelManagement.vbs
```

### إلغاء التثبيت
```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-windows-startup.ps1 -Remove
```

---

## ويندوز — الطريقة الثانية (مهمة مجدولة — تبدأ مع تشغيل النظام)

هذه الطريقة تشغّل الخادم **قبل تسجيل أي مستخدم** (أثناء boot)، وتتطلب صلاحيات مدير:

### التشغيل
1. افتح PowerShell **كمسؤول** (Run as Administrator).
2. نفّذ:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-windows-startup.ps1 -Method Task
```
تُنشأ مهمة مجدولة باسم `HotelManagementServer` تبدأ مع إقلاع النظام.

### التحقق
```powershell
Get-ScheduledTask -TaskName "HotelManagementServer" | Format-Table TaskName, State
```

### إلغاء
```powershell
schtasks /Delete /TN "HotelManagementServer" /F
```

---

## لينكس — systemd

### 1) التثبيت (مرة واحدة)
```bash
sudo bash scripts/install-linux-startup.sh
```
هذا النص:
- ينسخ المشروع إلى `/opt/hotel-management`
- ينشئ مستخدم `hotel`
- يُثبّت ويشغّل systemd service على المنفذ 3210
- يفعّل الإقلاع التلقائي عند التشغيل

### 2) التحقق
```bash
systemctl status hotel-web
journalctl -u hotel-web -f    # مراقبة السجلات
```

### 3) أوامر مفيدة
```bash
systemctl stop hotel-web      # إيقاف مؤقت
systemctl restart hotel-web   # إعادة التشغيل
systemctl disable hotel-web   # إزالة الإقلاع التلقائي
```

### إزالة التثبيت بالكامل
```bash
sudo systemctl disable --now hotel-web
sudo rm /etc/systemd/system/hotel-web.service
sudo rm -rf /opt/hotel-management
```

---

## التشغيل اليدوي (بدون إقلاع تلقائي)

### ويندوز
```powershell
npm run dev           # من جذر المشروع
# أو:
scripts\start-hotel-windows.bat
```

### لينكس
```bash
npm run dev           # من جذر المشروع
```

### الإيقاف
```bash
# ويندوز:
taskkill /F /IM node.exe

# لينكس:
sudo killall node
# أو:
systemctl stop hotel-web
```

---

## ملاحظات مهمة

- **المنفذ 3210**: تأكد أنه حراً في كل المنصات (يمكن تغييره في `apps/web/package.json` سطر `dev` و`apps/web/.env` سطر `NEXT_PUBLIC_APP_URL`).
- **قاعدة البيانات**: PostgreSQL يجب أن يعمل قبل الخادم. على لينكس، ي/events اعتماد `After=postgresql.service` في ملف systemd.
- **istinguished Logs**: سجلات الخادم على ويندوز تظهر في `dev-server.log` في جذر المشروع.
- **الإنتاج**: لبيئة إنتاج حقيقية استخدم `npm run build && npm run start` (بدلاً من `npm run dev`) واذكر ذلك في ملف systemd أو السكربت.