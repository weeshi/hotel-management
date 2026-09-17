# وثيقة معماريّة — غرفة تحكّم مالك المنصة + المصادقة الثنائية (Super Admin Control Room & Email OTP 2FA)

> **الحالة:** 🟢 **SA.1 (Foundation) و SA.2 (Auth Core — Backend) مُنجَزان.**
> اكتمل **كود الخادم** للمصادقة الثنائية (OTP Service + مسارا `login`/`verify-otp` + شرط `tv` في الـ Middleware + `withPlatformAuth`). بقي **الواجهة الأمامية (UI)** والتوسعة منفصلتين في SA.3→SA.6 كما هو مبيّن في §10 — بقرار صريح من الإدارة التقنية.
>
> هذا المستند هو **مصدر الحقيقة** لمنطقة الـ Super Admin؛ أي انحراف أثناء التنفيذ يُعدّل هنا فوراً.

---

## 1) 🎯 الهدف وغير الهدف

**الهدف:** إنشاء **منطقة معزولة تماماً** في النظام مخصّصة لمالك المنصة (Super Admin)، محميّة بمصادقة ثنائية عبر البريد الإلكتروني (Email OTP). هذه المنطقة هي الواجهة الوحيدة لإدارة مفاتيح بوابات الدفع وإعدادات المواقع العالمية (OTAs) **بالنيابة عن الفنادق المشتركة** في المنصة.

**الدافع التجاري:** النظام يتحوّل إلى منصة SaaS حقيقية. لا يجوز تعديل مفاتيح بوابات الدفع والـ OTAs يدوياً في قاعدة البيانات؛ نحتاج واجهة تحكّم مركزية. وبما أنّ هذه المفاتيح **حرجة سيادياً** (تتحكّم بأموال الفنادق)، فهي **حصرية لمالك النظام** ولا تُتاح لمدراء الفنادق إطلاقاً.

**غير الأهداف (صريح):**
- **ليس** لوحة إدارة فنادق متعددة المستأجرين للمدراء — مدراء الفنادق لا يرون هذه المنطقة ولا يصلون إليها بأي حال.
- **ليس** استبدالاً لمصادقة الموظفين الحالية — يبقى `accessToken`/`refreshToken` كما هو لبقية الأدوار.
- **ليس** تطبيقاً مصغّراً داخل صفحة الويب — المنطقة معزولة بمجموعة توجيه (Route Group) ومخطط مستقل.

**المبدأ الحاكم:** *"لا ثقة في العميل"* — البوابة النهائية هي الخادم (Middleware على الحافة + بوّابة API مستقلة). إخفاء العناصر في الواجهة مساعد بصري وليس ضماناً أمنياً (AGENTS §11).

---

## 2) 🧱 نموذج التهديد (Threat Model)

| التهديد | الأثر | الضابط المُعتمد |
|---|---|---|
| سرقة كلمة مرور السوبر أدمن (تسريب/تصيّد) | استيلاء على المنصة كاملة | **2FA إلزامية** — كلمة المرور وحدها لا تُصدر جلسة صالحة |
| اعتراض رمز OTP من البريد | تجاوز الطبقة الثانية | صلاحية قصيرة (10 دق) + استخدام لمرة واحدة + ربط الجلسة بمتصفح الطالب |
| تخمين الكود (Brute-force) | تجاوز | 6 أرقام + حد محاولات (5) + Rate-limit + إبطال التحدي عند التجاوز |
| تسرّب قاعدة البيانات | كشف كود OTP → استيلاء | **تخزين الكود مُهشَّراً (HMAC)** — انظر §5 |
| إصدار رمز من الطبقة الأولى وتقديمه للطبقة الثانية | تجاوز 2FA بالكامل | **رموز مفصولة:** رمز تحدٍّ محدود النطاق مقابل رمز جلسة موثّق `tv` |
| تصاعد صلاحيات من دور مستأجر | وصول غير مصرّح | فحص `role === 'SUPER_ADMIN'` على الحافة + بوّابة API + فحص `hotelId` |
| قراءة أسرار البوابات من الواجهة | تسريب مفاتيح الدفع | تخزين مُشفّر AES-256-GCM، لا تُعاد أبداً، `hasKey` فقط (AGENTS §9/§16) |
| إعادة استخدام رمز قديم (Replay) | تنفيذ مزدوج/مخوّل | طابع زمني + `jti` + استهلاك التحدي (`consumedAt`) |

**سطح المسؤولية الأعلى:** SUPER_ADMIN هو أعلى سلطة في النظام (`hotelId = null`)؛ وبالتالي أي مسار يمنح جلسة كاملة له يجب أن يعبر **طبقتين** (كلمة مرور + OTP) بلا استثناء.

---

## 3) 🏗️ المعمارية العامة

```
                    ┌──────────────────────────────────────────────────┐
                    │                  المتصفح                         │
                    │  /superadmin/login → /superadmin/otp → /superadmin │
                    └───────┬──────────────────────────────┬───────────┘
                            │ (1) إيميل + باسورد            │ (4) الكود
                            ▼                              ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │                  Next.js Edge Middleware                        │
        │  • /superadmin/*  محميّ بـ accessToken + role + tv=true         │
        │  • استثناءات: /superadmin/login · /superadmin/otp              │
        └───────┬─────────────────────────────────────────────────────────┘
                │
                ▼
        ┌───────────────────────────┐        ┌──────────────────────────┐
        │  /api/superadmin/auth     │        │  /api/superadmin/        │
        │  login → (منحنى) OTP      │        │  integrations            │
        │  verify-otp → tv token    │        │  (hotelId-scoped)        │
        └───────┬───────────────────┘        └───────────┬──────────────┘
                │                                        │
                │ (2) توليد + إرسال كود                  │ (5) تشفير AES-256-GCM
                ▼                                        ▼
        ┌───────────────┐                        ┌──────────────────────┐
        │ Email Gateway │  (Resend / dev-log)    │  IntegrationConfig   │
        │  sendEmail()  │                        │  (apiKeyEnc مُشفّر)  │
        └───────────────┘                        └──────────────────────┘
                │
                ▼
        ┌───────────────────────┐        ┌──────────────────────────┐
        │   OtpChallenge (DB)    │        │  PlatformAuditLog (DB)   │
        │  codeHash · expiry ·   │        │  كل حدث أمني             │
        │  attempts · consumed   │        └──────────────────────────┘
        └───────────────────────┘
```

**قاعدة العزل:** هذا الرسم لا يتقاطع مع مسارات المستأجرين. أي تعديل مستقبلي يلامس `/superadmin` يمرّ عبر هذا المستند.

---

## 4) 🛡️ عزل منطقة الـ Super Admin

### 4.1 مجموعة التوجيه المعزولة `app/(superadmin)/`

ننشئ مجموعة توجيه مستقلة تحت `src/app/(superadmin)/superadmin/...` بـ`layout.tsx` خاص (بلا هيكل لوحة التحكم العادية، بتصميم وسمات أمنية منفصلة).

> **قيد مهم:** لا يمكن أن يوجد مسار URL واحد في مجموعتَي توجيه. لذلك **تُنقل** الصفحات الحالية من `app/(dashboard)/superadmin/*` إلى `app/(superadmin)/superadmin/*` (نقل، لا نسخ). مسارات الـ API تبقى تحت `app/api/superadmin/` لأن مجموعات التوجيه لا تنطبق على `/api`.

### 4.2 الحماية المزدوجة (Dual-Protection)

| الطبقة | الموقع | ما تفحصه | سلوك الرفض |
|---|---|---|---|
| **1. Edge Middleware** | `src/middleware.ts` | التوقيع + `role === 'SUPER_ADMIN'` + **`tv === true`** | تحويل إلى `/superadmin/login` أو `/access-denied` |
| **2. Client Layout Guard** | `(superadmin)/superadmin/layout.tsx` | حالة مصادقة مشتقّة من الخادم | تحويل إلى `/access-denied` (تجربة مستخدم فقط) |
| **3. API Gate** | `withPlatformAuth` | التوقيع + الدور + `tv` | `401` / `403` بصيغة موحّدة |

> **إصلاح مكتشَف:** الحاجز العميلي الحالي (`(dashboard)/superadmin/layout.tsx:18`) يقرأ `localStorage.user.role` — وهذا مخالف لـ AGENTS §10 (لا ثقة بالعميل). سيُستبدل بحاجز يعتمد على استجابة الخادم فقط. القرار الأمني يبقى دائماً للـ Middleware.

### 4.3 قواعد الـ Middleware

```
/superadmin/* محميّ، ما عدا:
    /superadmin/login          ← نقطة الدخول (بلا جلسة)
    /superadmin/otp            ← شاشة إدخال الكود (بلا جلسة كاملة، تحمل رمز التحدي)

الشروط لاجتياز الحماية:
    verifyAccessToken(cookie.accessToken)  AND
    payload.role === 'SUPER_ADMIN'          AND
    payload.tv   === true                    ← أُثبتت 2FA لهذه الجلسة
```

`/admin/queues` (Bull Board) يبقى محميّاً بـ SUPER_ADMIN كما هو اليوم (AGENTS/README)، ويُضاف إليه شرط `tv` أيضاً — **تمّ تنفيذ ذلك فعلياً** في `src/middleware.ts` و`src/middlewares/superadmin-cookie.ts`.

> **استثناءات الدخول:** صفحتَا `/superadmin/login` و`/superadmin/otp` ستُضافان إلى قائمة الاستثناءات عند بناء الواجهة في SA.3/SA.5. حالياً (بلا UI) لا يوجد أي مسار حقيقي يلبسهما، والمطلَق أنه لا شيء داخل `/superadmin` يجب أن يمرّ بدون `tv=true`.

---

## 5) 🔐 المصادقة الثنائية عبر البريد (Email OTP) — دورة الحياة

### 5.1 نموذج الرموز (Token Model) — الفصل بين الطبقتين

هذه النقطة هي **قلب الأمان**: لا يجوز أن يحصل من أدخل كلمة المرور فقط على `accessToken` كامل.

| الرمز | يُصدر عند | النطاق (`scope`) | العمر | التخزين | الغرض |
|---|---|---|---|---|---|
| **رمز التحدي** `sa_otp` | نجاح كلمة المرور | `superadmin:otp` فقط | 10 دقائق | HttpOnly · SameSite=Strict · Path=`/api/superadmin/auth` | إثبات أنه أتمّ الطبقة الأولى فقط |
| **رمز الجلسة** `accessToken` | نجاح OTP | النظام كامل + `tv: true` | 15 دقيقة | HttpOnly · SameSite=Lax · Path=`/` | جلسة موثّقة بالكامل |
| **رمز التجديد** `refreshToken` | نجاح OTP | تجديد | 7 أيام | HttpOnly · SameSite=Strict · Path=`/api/auth` | بقاء الجلسة |

**النتيجة:** رمز التحدي **لا يصلح** لفتح أي صفحة في `/superadmin` (لأن الـ Middleware يشترط `tv === true`، ورمز التحدي لا يحمله)، ولا يصلح لأي API خارج `auth`. وبالعكس، رمز الجلسة لا يمكن الحصول عليه إلا بعد OTP.

### 5.2 التوليد والتخزين والتحقق

**التوليد:**
- `crypto.randomInt(0, 1_000_000)` ثم `padStart(6, '0')` — **يُمنع `Math.random()` نهائياً** (قاعدة النظام).
- يُرسَل الكود عبر `sendEmail()` القائم (`src/lib/gateways/email.gateway.ts`)؛ في التطوير يُطبع في السجل ولا يُرسَل فعلياً.

**التخزين — التوصية الهندسية (انظر §5.4 للتبرير):**
- **لا يُخزَّن الكود صريحاً أبداً.** يُخزَّن **HMAC-SHA256** كالتالي:
  `codeHash = HMAC_SHA256( message = `${userId}:${purpose}:${code}`, key = SUPERADMIN_OTP_SECRET )`
- يُخزَّن في `OtpChallenge.codeHash`. ربط الحدث بالـ`userId` يمنع إعادة استخدام بصمة كود لِحساب آخر.

**التحقق:**
1. قراءة رمز التحدي من الكوكي `sa_otp` والتحقق من توقيعه ونطاقه.
2. تحميل `OtpChallenge` بالمعرّف، والتأكد: غير مُستهلك (`consumedAt = null`)، غير منتهٍ (`expiresAt > now`)، و`attempts < maxAttempts`.
3. إعادة حساب HMAC للكود المُدخل ومقارنته بـ`codeHash` عبر **`crypto.timingSafeEqual`** (مقارنة ثابتة الزمن).
4. **النجاح:** `consumedAt = now`، ثم إصدار `accessToken` يحمل `tv: true` + `refreshToken`، ومسح كوكي التحدي، وكتابة `PlatformAuditLog`.
5. **الفشل:** `attempts++`. عند بلوغ الحد: `consumedAt = now` (إبطال التحدي) وإلزام المستخدم بالبدء من جديد؛ وتُسجَّل المحاولة.

### 5.3 الحدود الزمنية وإعادة الإرسال

| الضابط | القيمة المقترحة | السبب |
|---|---|---|
| صلاحية الكود | **10 دقائق** | كافٍ للإنسان، ضيّق على المهاجم |
| عدد المحاولات | **5** | فضاء البحث 10⁶ — 5 محاولات ≈ 0.0005% |
| تهدئة إعادة الإرسال | **60 ثانية** | منع الإغراق/التخمين عبر إعادة التوليد |
| سقف إعادة الإرسال | **5/ساعة** لكل مستخدم | منع DoS على البريد/التكلفة |
| تحدٍّ نشط واحد | **واحد** لكل (مستخدم، غرض) | إبطال ما قبله عند التوليد |

- إعادة الإرسال **تُبطل أي تحدٍّ نشط سابق** قبل إنشاء الجديد (منع التراكم).
- Rate-limit على مستوى الـ IP أيضاً (عبر `withRateLimit`).

### 5.4 ⚖️ القرار: تخزين الكود **مُهشَّراً** لا صريحاً

**التوصية: Hashing (HMAC-SHA256 بمفتاح سري على الخادم).**

**لماذا؟** رغم أن الكود قصير العمر، فهو **بيانات اعتماد حاملة (Bearer Credential)** لأعلى حساب صلاحية في النظام. تخزينه صريحاً يعني أنّ أي **قراءة لقاعدة البيانات** (تسريب نسخة احتياطية، SQL Injection، وصول داخلي خبيث) تُنتج استيلاءً كاملاً على المنصة — وهذا **بالضبط** السيناريو الذي وُجدت 2FA لمنعه.

**لماذا HMAC وليس bcrypt/argon2؟**
- فضاء الكود 10⁶ فقط. لو تسرّبت البصمة الصريحة، أي هجوم خارجي على bcrypt سيجرب 10⁶ احتمالاً فقط — أي **قابلاً للكسر عملياً** مهما علت كلفة الدالة.
- **HMAC بمفتاح `SUPERADMIN_OTP_SECRET` يجعل الهجوم الخارجي مستحيلاً**: بدون المفتاح لا يمكن توليد مرشّح واحدٍ للمقارنة (لا precompute ولا dictionary).
- HMAC **رخيص ثابت الكلفة**، بينما bcrypt على مسار تحقّق عام يفتح باب **DoS استهلاك CPU**.
- لا نحتاج إظهار الكود مجدداً أبداً (وُجد ليُدخَل مرة واحدة)، فلا حاجة لعكس البصمة.

**الخلاصة:** الهشير وحده ليس كافياً، والملح وحده لا يكفي. **HMAC بمفتاح سري + حدّ محاولات + صلاحية قصيرة + استخدام لمرة واحدة** = دفاع متعدد الطبقات.

### 5.5 مخطط التتابع (Sequence)

```
المستخدم            Middleware/App            Auth API              Email         DB
   │                     │                       │                   │            │
   │── إيميل+باسورد ────►│                       │                   │            │
   │                     │── POST /auth/login ──►│                   │            │
   │                     │                       │── تحقق الباسورد ──│───────────►│
   │                     │                       │── HMAC(الكود) ────│───────────►│ OtpChallenge
   │                     │                       │── sendEmail() ───►│            │
   │◄─ كوكي sa_otp ──────│◄─ {otpRequired:true} ─│                   │            │
   │── الكود ──────────► /superadmin/otp         │                   │            │
   │── POST verify-otp ►│──────────────────────►│── قراءة التحدي ───│───────────►│
   │                     │                       │── timingSafeEqual │            │
   │                     │                       │── consumedAt=now ─│───────────►│
   │◄─ accessToken(tv) ──│◄─ {user} ─────────────│── PlatformAudit ──│───────────►│
│── /superadmin ─────►│ (tv=true ⇒ مرور)      │                   │            │
   ```

---

### 5.6 نسبة معدَّلة (Rate-Limit) في `/verify-otp` — القرار المنفَّذ

سؤال الإدارة التقنية: هل نكتفي بحقل `attempts` على التحدي أم نضيف مُقيّد Redis؟ **القرار: طبقات (Layered)** — كل طبقة تكمل الأخرى ولا تُثق بأي واحدة وحدها:

| الطبقة | الآلية (كما نُفِّذت) | الدور | تُعدّ سقفاً موثوقاً؟ |
|---|---|---|---|
| 1. أرضية حسابية | `OtpChallenge.attempts` مقابل `maxAttempts` (5) | سقف صارم **لكل تحدٍّ** — يُحسب في نفس معاملة الـ DB | ✅ نعم (معتمد) |
| 2. إغلاق الحساب | عند نفاد التحدي: `consumedAt=now` + `User.lockedUntil=15 دقيقة` | يقتل "إعادة التحدي" (إعادة الدخول ← 5 تخمينات ← تكرار) | ✅ نعم |
| 3. سقف موزّع | `checkRateLimit('otp:verify:{ip}:{userId}', 10, 60)` بـ Redis | كبح التزامن الموزّع بين نسخ/عمليات متعددة | ⚠️ **Fail-open عمداً** |

**لماذا fail-open للطبقة 3؟** الأرضية الحسابية (1+2) تبقى سارية حتى لو سقط Redis؛ والـ fail-closed سيمكّن انقطاع Redis من **قفل مالك المنصة خارج لوحته** (Self-DoS). لذلك نسجّل الخطأ ونواصل — الطبقة 2 هي التي توقف المهاجم فعلياً في كل الحالات.

**لماذا `withRateLimit` وحده لا يكفي؟** إنه **في ذاكرة العملية** (`Map` داخلي) — أرضيّة لكل عملية، تُمسح عند إعادة التشغيل، وتُخدَع بتوزيع الحمل بين نسخ متعددة. صالح كتشحيم خام على `/login`، لكنه **ليس** حاجزاً أمنياً بذاته — ومن هنا دور الطبقة 1+2.

---

## 6) 🗄️ تغييرات مخطط قاعدة البيانات (تمّت في هذه المرحلة)

### 6.1 جدول `User` — أعلام 2FA

| الحقل | النوع | ملاحظة |
|---|---|---|
| `twoFactorSecret` | `String?` | **موجود مسبقاً** — محجوز لمستقبل TOTP |
| `twoFactorEnabled` | `Boolean @default(false)` | **موجود مسبقاً** — يُفعَّل إلزامياً لحساب المنصة |
| `twoFactorMethod` | `TwoFactorMethod @default(NONE)` | **جديد** — يحدّد الوسيلة (`EMAIL_OTP`/`TOTP`) للتوسّع |
| `lastTwoFactorAt` | `DateTime?` | **جديد** — آخر تحقّق ناجح (تدقيق/كشف شذوذ) |

### 6.2 جدول جديد `OtpChallenge` — دورة حياة الكود

| الحقل | النوع | الوظيفة |
|---|---|---|
| `id` | `String @id` | يُرسَل كـ`jti` في رمز التحدي |
| `userId` | `String` (FK → User) | صاحب الطلب |
| `purpose` | `OtpPurpose` | `SUPER_ADMIN_LOGIN` / `SUPER_ADMIN_STEP_UP` |
| `codeHash` | `String` | **HMAC** — لا الكود الصريح |
| `sentTo` | `String` | لقطة من البريد وقت الإرسال (تدقيق) |
| `expiresAt` | `DateTime` | انتهاء الصلاحية |
| `attempts` / `maxAttempts` | `Int` | عدّاد المحاولات |
| `consumedAt` | `DateTime?` | استخدام لمرة واحدة (نجاح/إبطال) |
| `ip` / `userAgent` | `String?` | سياق الطلب (كشف الشذوذ) |
| `createdAt` | `DateTime` | زمن الإنشاء |

**لماذا جدول منفصل بدل أعمدة `otpSecret`/`otpExpiresAt` على `User`؟** لأنّ التحدّي **كيان عابر (Ephemeral)** له عمر ومحاولات واستهلاك وتدقيق؛ وضغطه في أعمدة على `User` يجعل **تسجيلَين متزامنين يُطمس أحدهما الآخر**، ويفقد التاريخ الأمني. الجدول المنفصل يحفظ كل تحدٍّ كسجلٍّ مستقل (سلسلة تدقيق كاملة) ويسمح بتعدّد الأغراض (دخول/Step-up) دون تلويث جدول المستخدمين. أعلام `User` أُبقيت للسياسة العامة (هل 2FA مفعّلة/بأي وسيلة).

### 6.3 جدول جديد `PlatformAuditLog` — سجل تدقيق المنصة

`AuditLog` الحالي يشترط `hotelId` (إلزامي) حفاظاً على سلامة تدقيق المستأجرين، لكن أحداث المنصة (إصدار/تحقق OTP، تعديل مفاتيح بوابات الفنادق) **ليست مقيّدة بفندق واحد**. لذلك نضيف سجلاً مستقلاً للمنصة (`actorUserId`, `actorEmail`, `action`, `entity`, `entityId`, `hotelId?`, `oldValue?`, `newValue?`, `ip`, `userAgent`, `createdAt`).

> **سياسة:** لا يُكتب **كود OTP** ولا **سرّ مفاتيح البوابة** في هذا السجل أبداً — تُسجَّل الأفعال والنتائج فقط.

---

## 7) 🔌 تصميم واجهة الربط (Integration API) — `api/superadmin/integrations`

> **الحالة:** تصميم مُعتمد، يُنفَّذ في الخطوة التالية. لا كود في هذه المرحلة.

### 7.1 العقود (Contracts)

| Method | المسار | الوصف |
|---|---|---|
| `GET` | `/api/superadmin/integrations?hotelId=<id>` | يسرد تكاملات فندق محدّد (مُقنّعة) |
| `POST` | `/api/superadmin/integrations` | إنشاء/تحديث تكامل لفندق (`upsert` على `hotelId+engine`) |
| `PATCH` | `/api/superadmin/integrations/[id]` | تفعيل/تعطيل (بلا تغيير الأسرار) |
| `DELETE` | `/api/superadmin/integrations/[id]` | إبطال التكامل (Soft-delete/تعطيل) |

**نقطة جوهرية:** الـAPI **يشترط `hotelId`** — السوبر أدمن يختار الفندق **أولاً** ثم يُدخل مفاتيحه. لا تُقبل تكاملات بلا فندق (مفاتيح الدفع ملك الفندق، لا المنصة).

### 7.2 جسم الطلب (مثال POST)

```jsonc
{
  "hotelId": "uuid-of-hotel",
  "provider": "plutu",          // أو tlync / ohd / otas...
  "kind": "PAYMENT_GATEWAY",    // أو BOOKING_ENGINE / OTA_CHANNEL
  "secret": {                    // الحقول الحسّاسة (تُشفَّر كوحدة واحدة)
    "secretKey": "…",
    "merchantId": "…"
  },
  "config": { "baseUrl": "https://…", "isActive": true }  // حقول غير سرّية
}
```

### 7.3 قواعد إلزامية (تطابق AGENTS §9/§16)

1. **التشفير:** يُشفَّر `secret` كوحدة JSON بواسطة `encryptSecret()` (AES-256-GCM بمفتاح `PAYMENT_CRYPTO_KEY`) ويُخزَّن في `IntegrationConfig.apiKeyEnc`.
2. **عدم الإرجاع:** لا يُعاد السرّ ولا جزء منه في **أي** استجابة أو سجل. يُعرض `hasKey: true|false` فقط.
3. **التحقق من الملكية:** التأكد أن `hotelId` موجود (`404` إن لم يكن) — لا نُنشئ تكاملاً لفندق وهمي.
4. **السجلّ:** كل كتابة تُنتج `PlatformAuditLog` (القيم `oldValue/newValue` لأعلام غير حسّاسة فقط).
5. **سلسلة وسطاء الطفرات (إلزامية):** `withPlatformAuth(withCsrf(withRateLimit(handler)))` — والاستعلامات القرائية تكتفي بـ`withPlatformAuth` + Rate-limit.
6. **المنطقة الزمنية للقراءة:** `GET` لا يكشف الأسرار المشفّرة، فقط `{ provider, kind, isActive, hasKey, updatedAt }`.

### 7.4 تطوّر `IntegrationConfig` المقترح (الخطوة التالية)

`IntegrationConfig` الحالي يحمل `engine` (محركات حجز) و`apiKeyEnc` (سرّ واحد) و`config` (JSON). لتغطية بوابات الدفع نحتاج تجميع عدّة حقول سرّية. المقترح **دون كسر التوافق**:

- الإبقاء على `apiKeyEnc` كـ**حزمة سرّية مشفّرة** (JSON) — السرّ النصّي القديم يبقى صالحاً (توافق خلفي).
- إضافة `kind IntegrationKind @default(BOOKING_ENGINE)` لتصنيف التكامل.
- إضافة `updatedById String?` لتتبّع من عدّل المفاتيح.
- إنشاء **سجل مزوّدين (Provider Registry)** `src/lib/integrations/registry.ts` يربط كل `provider` بـ: `kind`، الحقول السرّية المطلوبة، حقول `config` المسموحة، وقاعدة التحقق. يُستخدم السجل في الـAPI وفي الواجهة (Schema-driven).

---

## 8) 🔑 متغيّرات البيئة الجديدة (Env)

| المتغيّر | الغرض | القيود |
|---|---|---|
| `SUPERADMIN_OTP_SECRET` | مفتاح HMAC لكود OTP + توقيع رمز التحدي | ≥ 32 حرفاً · **سرّي تماماً** · لا يبدأ بـ`NEXT_PUBLIC_` |
| `SUPERADMIN_OTP_TTL_SECONDS` | صلاحية الكود (افتراضي 600) | — |
| `SUPERADMIN_OTP_MAX_ATTEMPTS` | حد المحاولات (افتراضي 5) | — |
| `SUPERADMIN_OTP_RESEND_COOLDOWN_SECONDS` | تهدئة إعادة الإرسال (افتراضي 60) | — |

**التسليم:** يستخدم `RESEND_API_KEY` القائم عبر `sendEmail()`. في التطوير/بدون مفتاح يُطبع الكود في السجل فقط (سلوك البوابة الحالي).

---

## 9) 🚫 مصائد وممنوعات (Anti-Patterns)

- ❌ **منع** وضع كود OTP في حمولة JWT (يتسرّب عبر `localStorage`/سجلات).
- ❌ **منع** استخدام `accessToken` كرمز تحدٍّ (يجب رمز منفصل محدود النطاق).
- ❌ **منع** الاعتماد على `localStorage` لأي قرار أمني (مخالف §10).
- ❌ **منع** تخزين الكود صريحاً أو تسجيله في logs.
- ❌ **منع** إصدار جلسة كاملة لسوبر أدمن بتخطي OTP حتى لو كانت الراية `twoFactorEnabled=false` — تُعامَل كخطأ تهيئة وتُرفض.
- ❌ **منع** تخزين أسرار البوابات في `.env`؛ هي بيانات مستأجر ⇒ قاعدة البيانات مُشفّرة (§9).
- ❌ **منع** `Math.random()` في توليد الكود.

---

## 10) 🧭 خطة التنفيذ والمراحل

| المرحلة | المخرجات | الحالة |
|---|---|---|
| **SA.1 — Foundation** | هذا المستند + تعديلات `schema.prisma` + Migration | 🟢 **مُنجَز** |
| **SA.2 — Auth Core (Backend)** | `SuperAdminOtpService`، مسارا `/api/superadmin/auth/{login,verify-otp}`، `tv` في `AccessTokenPayload`/`RefreshTokenPayload`، شرط `tv` في الـ Middleware + `superadmin-cookie`، `withPlatformAuth`، `recordPlatformAudit`، اختبار تكاملي | 🟢 **مُنجَز** (بلا واجهة) |
| **SA.3 — Isolation** | نقل الصفحات إلى `(superadmin)`، استثناءات الدخول في الـ Middleware (عند وجود الصفحات)، استبدال الحاجز العميلي | ⏳ (جزء الـ Middleware أُنجز ضمن SA.2) |
| **SA.4 — Integration API** | `api/superadmin/integrations` + Provider Registry + تطور `IntegrationConfig` (الحراسة `withPlatformAuth` جاهزة) | ⏳ |
| **SA.5 — UI** | شاشة الدخول/OTP + لوحة مفاتيح التكامل (Schema-driven) | ⏳ (لاحقاً) |
| **SA.6 — Hardening** | Step-up للعمليات الحسّاسة، اختبارات أمنية، توثيق README | ⏳ |

---

## 11) 🔗 مراجع

- `apps/web/AGENTS.md` §9 (الأسرار) · §10 (الجلسات) · §11 (RBAC وعزل المنصة) · §13 (التوثيق الحيّ) · §16 (أمان التكاملات).
- `apps/web/prisma/schema.prisma` — `User` · `IntegrationConfig` · `AuditLog`.
- `apps/web/src/middlewares/auth.ts` · `superadmin-cookie.ts` · `csrf.ts` · `rate-limit.ts`.
- `apps/web/src/lib/utils/jwt.ts` · `crypto.ts` · `password.ts`.
- `apps/web/src/lib/services/auth.service.ts` · `src/app/api/auth/login/route.ts`.
- `apps/web/src/lib/gateways/email.gateway.ts`.
- `docs/SECURITY-LOCAL-GATEWAYS.md` · `docs/CONTRACT-TESTING-ARCH.md`.

---

## 12) ✅ ما تم بناؤه فعلياً (SA.1 + SA.2)

### SA.1 — Foundation

| الملف | التغيير |
|---|---|
| `docs/SUPER-ADMIN-ARCH.md` | هذا المستند (مصدر الحقيقة) |
| `apps/web/prisma/schema.prisma` | `TwoFactorMethod` + `OtpPurpose` · حقول 2FA على `User` · `OtpChallenge` · `PlatformAuditLog` |
| `apps/web/prisma/migrations/<ts>_add_superadmin_2fa/` | Migration SQL (مطبَّقة + `migrate resolve`) |
| `README.md` | مزامنة المخطط (AGENTS §13) |

### SA.2 — Auth Core (Backend خالص)

| الملف | التغيير |
|---|---|
| `apps/web/src/lib/utils/otp.ts` | `generateOtpCode()` (randomInt) · `hashOtpCode()` (HMAC-SHA256 ببيبّر) · `safeEqualHex` (timingSafeEqual) · `maskEmail` · دوال إعدادات TTL/محاولات |
| `apps/web/src/lib/utils/jwt.ts` | `tv?` في `AccessTokenPayload` **و**`RefreshTokenPayload` · `signOtpChallengeToken`/`verifyOtpChallengeToken` (نطاق `superadmin:otp`) بمفتاح خاص |
| `apps/web/src/lib/services/superadmin-otp.service.ts` | `requestOtp` (إبطال التحدي السابق، توليد+هش+بريد، إرجاع البصمة لا الكود) · `verifyOtp` (انتهاء/استهلاك/محاولات + **إغلاق الحساب 15 دقيقة عند النفاد**) |
| `apps/web/src/lib/services/platform-audit.service.ts` | `recordPlatformAudit()` → `PlatformAuditLog` |
| `apps/web/src/lib/services/auth.service.ts` | `authenticateCredentials()` (عزل عامل الباسورد) · `issueSession(user,{tv})` · الحفاظ على `tv` عبر التجديد |
| `apps/web/src/app/api/superadmin/auth/login/route.ts` | عامل1: فحص الباسورد فقط، رفض **الحسابات بلا 2FA** (403)، إرسال OTP + كوكي `sa_otp` (HttpOnly/strict/path-scoped) + تدقيق — `withRateLimit(10)` |
| `apps/web/src/app/api/superadmin/auth/verify-otp/route.ts` | عامل2: `withCsrf` + سقف Redis (fail-open) + استهلاك التحدي → `issueSession({tv:true})` + مسح `sa_otp` + تدقيق |
| `apps/web/src/middleware.ts` | `/superadmin` و`/admin/queues` تشترطان `role==='SUPER_ADMIN'` **و**`tv===true` |
| `apps/web/src/middlewares/superadmin-cookie.ts` | الحاجز البكري ينضاف له شرط `tv` (Bull Board) |
| `apps/web/src/middlewares/platform-auth.ts` | بوّابة API تحت `/api/superadmin/*` (Bearer أو كوكي الجلسة) + `tv` |
| `apps/web/scripts/test-superadmin-otp.ts` | اختبار تكاملي شامل (20 فحصاً) — `npm run test:superadmin-otp` |
| `.env.example` / `apps/web/package.json` | متغيرات OTP جديدة + سكربت `test:superadmin-otp` |

**نتيجة الاختبار التكاملي:** 20/20 فحص بلا أخطاء (فشل الباسورد، توليد التحدي، رفض الكود الخاطئ+عدّ المحاولة، نجاح `tv=true`، إغلاق الحساب، رفض الدخول بعد القفل). `tsc --noEmit` نظيف، `README`/السجلات متزامنة، والاختبارات الشاملة 274/274 تمر.

> **⚠️ ملاحظة انتقالية معروفة (UI):** بما أنّ جلسات السوبر أدمن الحالية (قبل SA.2) **بلا `tv`**، صارت الـ Middleware ترتد أي وصول لـ`/superadmin` إلى `/auth/login` — وصفحة `/auth/login` الحالية لا تدرك تدفق 2FA فتدفع المستخدم لـ`/superadmin` مجدداً (التحقق الكامل عبر API يعمل، لكن الواجهة بلا مسار OTP). **الحل مقصود في SA.3/SA.5**: بناء `/superadmin/login` + `/superadmin/otp` وربطهما بصفحة الدخول عند رصد دور `SUPER_ADMIN`. لا تعديل على الواجهة الآن (قرار الإدارة التقنية).
