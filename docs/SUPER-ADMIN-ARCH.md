# وثيقة معماريّة — غرفة تحكّم مالك المنصة + المصادقة الثنائية (Super Admin Control Room & Email OTP 2FA)

> **الحالة:** 🟢 **SA.1 (Foundation) و SA.2 (Auth Core — Backend) و SA.4 (Integration API — Backend) و SA.4.5 (ربط مفاتيح بوابات الدفع) مُنجَزة.**
> اكتمل **كود الخادم** للمصادقة الثنائية (OTP Service + مسارات `login`/`verify-otp`/`resend-otp` + شرط `tv` في الـ Middleware + `withPlatformAuth`) ولإدارة مفاتيح التكاملات (`/api/superadmin/integrations` + Provider Registry + تطوّر `IntegrationConfig`) **وربطها بالتشغيل** (`payment-session` يقرأ من الـ DB عبر `resolveGatewayConfig`؛ الـ webhook على لقطة `gatewayConfig`). **وباك اند SA.6 (Step-up/Sudo Mode للعمليات الحسّاسة + الاختبارات الأمنية) مُنجَز.** بقي **الواجهة الأمامية (UI)** — بما فيها واجهة Step-up/Sudo للوحة، ومفاتيح التكامل Schema-driven — في متابعة SA.7 بقرار صريح من الإدارة التقنية (كما هو مبيّن في §10 و§12).
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
| **2. Server-Component Guard** | `(superadmin)/superadmin/(auth)/otp/page.tsx` + `(dashboard)/layout.tsx` | قراءة الكوكي + فك التحقق + استعلام DB للحالة الحيّة | `redirect()` فوري من الخادم إلى `/superadmin/login` |
| **3. API Gate** | `withPlatformAuth` | التوقيع + الدور + `tv` | `401` / `403` بصيغة موحّدة |

> **إصلاح منفَّذ (SA.5):** الحاجز القديم (`(dashboard)/superadmin/layout.tsx`) كان يقرأ `localStorage.user.role` — مخالف لـ AGENTS §10 (لا ثقة بالعميل). **أُزيل بالكامل**: نُقلت الصفحات إلى `(superadmin)/superadmin/(dashboard)/`، وصار الحاجز **Server Component** يقرأ كوكي `accessToken` (HttpOnly) + `verifyAccessToken` + فحص `role`/`tv` + استعلام DB — أي لا يوجد أي قرار أمني مبني على بيانات العميل.

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

> **استثناءات الدخول (مُنفَّذة في SA.5):** صفحتَا `/superadmin/login` و`/superadmin/otp` في قائمة الاستثناءات في `src/middleware.ts`. شاشة OTP تبقي أمانها في **صفحة Server Component** نفسها (تحقق `sa_otp` الكوكي + استعلام DB)، ومشاهدةُ جلسة موثّقة بالكامل لهما تُعاد توجيهها إلى `/superadmin` من الخادم. أي مسار آخر داخل `/superadmin` لا يمرّ بدون `tv=true` — ويُعاد إلى `/superadmin/login` (لا `/auth/login`).

---

## 5) 🔐 المصادقة الثنائية عبر البريد (Email OTP) — دورة الحياة

### 5.1 نموذج الرموز (Token Model) — الفصل بين الطبقتين

هذه النقطة هي **قلب الأمان**: لا يجوز أن يحصل من أدخل كلمة المرور فقط على `accessToken` كامل.

| الرمز | يُصدر عند | النطاق (`scope`) | العمر | التخزين | الغرض |
|---|---|---|---|---|---|
| **رمز التحدي** `sa_otp` | نجاح كلمة المرور | `superadmin:otp` فقط | 10 دقائق | HttpOnly · SameSite=Strict · Path=`/` | إثبات أنه أتمّ الطبقة الأولى فقط |
| **رمز الجلسة** `accessToken` | نجاح OTP | النظام كامل + `tv: true` | 15 دقيقة | HttpOnly · SameSite=Lax · Path=`/` | جلسة موثّقة بالكامل |
| **رمز التجديد** `refreshToken` | نجاح OTP | تجديد | 7 أيام | HttpOnly · SameSite=Strict · Path=`/api/auth` | بقاء الجلسة |

**النتيجة:** رمز التحدي **لا يصلح** لفتح أي صفحة في `/superadmin` (لأن الـ Middleware يشترط `tv === true`، ورمز التحدي لا يحمله)، ولا يصلح لأي API خارج `auth`. وبالعكس، رمز الجلسة لا يمكن الحصول عليه إلا بعد OTP.

> **لماذا `Path=/` لرمز التحدي (قرار SA.5):** الكوكي يجب أن يصل إلى **وجهتين**: (1) صفحة `/superadmin/otp` (Server Component يقرأه عبر `cookies()`) و(2) مسارات الشراء `/api/superadmin/auth/{verify-otp,resend-otp,logout}`. بما أن `/api/...` ليس بادئة من `/superadmin`, فإن `Path=/superadmin` لن يُرسل الكوكي إلى الـ API — لذا `Path=/` هو الاختيار الصحيح الوحيد (الخيار «أو `/`» من قرار الإدارة التقنية). الأمان لا يتغيّر: HttpOnly + SameSite=Strict + JWT موقّع بمفتاح مخصّص `SUPERADMIN_OTP_SECRET` + عمر قصير + نطاق `superadmin:otp`.

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
| تهدئة إعادة الإرسال | **60 ثانية** | منع الإغراق/التخمين عبر إعادة التوليد — أرضية DB حتمية (انظر §5.7) |
| سقف إعادة الإرسال | **3/5 دقائق** لكل (IP، مستخدم) | منع DoS على البريد/التكلفة — سقف موزّع fail-open |
| تحدٍّ نشط واحد | **واحد** لكل (مستخدم، غرض) | إبطال ما قبله عند التوليد |

- إعادة الإرسال **تُبطل التحدي النشط سابقاً** عند التوليد (منع التراكم). في `resend-otp` الإبطال **ذرّي وداخل الصف نفسه**: يُستبدل `codeHash` (الكود القديم يموت فوراً)، يُصفَّر `attempts`، ويُمدَّد `expiresAt` — دون إنشاء تحدٍّ جديد يُيتم رمز الكوكي.
- Rate-limit على مستوى الـ IP أيضاً (عبر `withRateLimit`). انظر §5.7 للتفاصيل الكاملة لمسار إعادة الإرسال.

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

### 5.7 إعادة إرسال الرمز — `POST /api/superadmin/auth/resend-otp` (SA.2.5)

**قرار الهوية (نوقش مع الإدارة):** يُقرأ المستخدم من **كوكي التحدي `sa_otp`** — **لا** من إيميل في جسم الطلب.

> **لماذا؟** الكوكي لا يُصدر إلا بعد نجاح كلمة المرور (عامل 1) وفحص تفعيل 2FA؛ أي أن إعادة الإرسال تتطلب مستعرضاً **دخل بكلمة المرور فعلاً**. لو قُبل الإيميل من الجسم لتحوّل المسار إلى بابٍ بلا مصادقة: **Spam/DoS على صندوق المالك** (أي غريب يشغّل إرسالاً حقيقياً) + **عدّاد وجود الحسابات (Enumeration)**. كما يحقق تطابقاً تاماً مع `verify-otp` (سلف التصميم) في نطاق الثقة نفسه.

**دورة الحياة (مثيلة `verify-otp`):**
1. قراءة كوكي `sa_otp` → إن غاب: `401 CHALLENGE_MISSING`.
2. تحقق التوقيع بمفتاح `SUPERADMIN_OTP_SECRET` + فحص `scope==='superadmin:otp'` و`challengeId` و`sub` → إن تلف: **مسح الكوكي** + `401 CHALLENGE_INVALID`.
3. **سقف موزّع fail-open:** `checkRateLimit('otp:resend:{ip}:{userId}', 3, 300)` — فشل-مفتوح تماماً كـ`verify-otp`؛ الأرضية الحتمية هي الـ CoolDown في الـ DB.
4. `resendOtp({userId, challengeId, ip, userAgent})` بسقف `SUPERADMIN_OTP_RESEND_COOLDOWN_SECONDS` (افتراضي 60؛ أرضية المخزون = `lastCodeSentAt ?? createdAt` — أي أن **رسالة الدخول الأولى نفسها** تحسب ضمن فترة التهدئة). أسباب الرفض المنعكسة: `COOLDOWN` (429 + `Retry-After`) · `EXPIRED` (410 + مسح) · `CONSUMED` (409) · `INVALID_CHALLENGE` (401 + مسح) · `LOCKED` (423).
5. **النجاح (نفس صف التحدي — بلا صف جديد):** استبدال `codeHash` (الكود القديم يموت فوراً · إبطال كود سابق) ← إعادة `attempts=0` ← `expiresAt = now + TTL` (تمديد الجلسة المعلّقة) ← `lastCodeSentAt = now`.
6. **إعادة إصدار كوكي التحدي** بحمل `exp` الممدَّد (مدة `maxAge` من جديد `expiresAt`) ثم إرسال البريد.
7. **تدقيق:** `SUPER_ADMIN_OTP_RESENT` عند النجاح، و`SUPER_ADMIN_OTP_RESEND_FAILED_<REASON>` عند الفشل — `recordPlatformAudit` (لا كود ولا سرّ في السجل). فشل الاستعراف (غياب/تلف الكوكي) **لا يُسجَّل** لئلا تُملأ الرسائل غير الموثّقة السجل.

**الحراسة:** `withCsrf` (نفس `verify-otp`) — التغيّير حالة -وكوكي-موثوق يستلزم CSRF، والـ 429 لا تسرّب أي إشارة وجود حساب (الردود موحّدة).

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
| `lastCodeSentAt` | `DateTime?` | **SA.2.5 —** زمن آخر بريد OTP (أساس أرضية التهدئة؛ الأولمبي = `createdAt`) |
| `ip` / `userAgent` | `String?` | سياق الطلب (كشف الشذوذ) |
| `createdAt` | `DateTime` | زمن الإنشاء |

**لماذا جدول منفصل بدل أعمدة `otpSecret`/`otpExpiresAt` على `User`؟** لأنّ التحدّي **كيان عابر (Ephemeral)** له عمر ومحاولات واستهلاك وتدقيق؛ وضغطه في أعمدة على `User` يجعل **تسجيلَين متزامنين يُطمس أحدهما الآخر**، ويفقد التاريخ الأمني. الجدول المنفصل يحفظ كل تحدٍّ كسجلٍّ مستقل (سلسلة تدقيق كاملة) ويسمح بتعدّد الأغراض (دخول/Step-up) دون تلويث جدول المستخدمين. أعلام `User` أُبقيت للسياسة العامة (هل 2FA مفعّلة/بأي وسيلة).

### 6.3 جدول جديد `PlatformAuditLog` — سجل تدقيق المنصة

`AuditLog` الحالي يشترط `hotelId` (إلزامي) حفاظاً على سلامة تدقيق المستأجرين، لكن أحداث المنصة (إصدار/تحقق OTP، تعديل مفاتيح بوابات الفنادق) **ليست مقيّدة بفندق واحد**. لذلك نضيف سجلاً مستقلاً للمنصة (`actorUserId`, `actorEmail`, `action`, `entity`, `entityId`, `hotelId?`, `oldValue?`, `newValue?`, `ip`, `userAgent`, `createdAt`).

> **سياسة:** لا يُكتب **كود OTP** ولا **سرّ مفاتيح البوابة** في هذا السجل أبداً — تُسجَّل الأفعال والنتائج فقط.

---

## 7) 🔌 تصميم واجهة الربط (Integration API) — `api/superadmin/integrations`

> **الحالة:** 🟢 **مُنفَّذة (SA.4 — Backend).** لا واجهة في هذه المرحلة. أنظر §12/SA.4 لتفاصيل الملفات.

### 7.1 العقود (Contracts)

| Method | المسار | الوصف |
|---|---|---|
| `GET` | `/api/superadmin/integrations?hotelId=<id>&kind=<kind>` | يسرد تكاملات فندق محدّد (مُقنّعة) — `kind` اختياري (`BOOKING_ENGINE`/`PAYMENT_GATEWAY`) |
| `POST` | `/api/superadmin/integrations` | إنشاء/تحديث تكامل لفندق (`upsert` على `hotelId+engine`) — يكتب الأسرار + `config` + `isActive` |
| `DELETE` | `/api/superadmin/integrations?hotelId=<id>&engine=<engine>` | **حذف دائم** لربط التكامل + إبطال المفاتيح (حذف Hard من الـ DB) |

**نقطة جوهرية:** الـAPI **يشترط `hotelId`** — السوبر أدمن يختار الفندق **أولاً** ثم يُدخل مفاتيحه. لا تُقبل تكاملات بلا فندق (مفاتيح الدفع ملك الفندق، لا المنصة).

### 7.2 جسم الطلب (مثال POST)

```jsonc
{
  "hotelId": "uuid-of-hotel",
  "engine": "plutu",            // أو tlync / booking.com / expedia / website / custom
  // "kind" يُشتق من Provider Registry تلقائياً — لا يُقبل في الجسم
  "secret": {                    // الحقول الحسّاسة (تُشفَّر كوحدة واحدة)
    "secretKey": "…",
    "merchantId": "…"
  },                             // لمحركات الحجز: { "apiKey": "…" } (توافق خلفي)
  "config": { "baseUrl": "https://…", "isSandbox": true },  // حقول غير سرّية فقط
  "isActive": true
}
```

**شكل التخزين في `apiKeyEnc`:**
- **بوابة دفع** (`PAYMENT_GATEWAY`): حزمة JSON مشفّرة `encryptSecret(JSON.stringify({merchantId, secretKey}))`.
- **محرك حجز** (`BOOKING_ENGINE`): نصّ خام مشفّر `encryptSecret(apiKey)` — **مطابق للتخزين القديم** حرفياً حتى يبقى `withExternalAuth` (المقارنة timing-safe مع النص المُفكّك) يعمل بلا تغيير.

**قرار هندسي مُعتمد (CTO):** الحزمة المشفّرة **محصورة** في الحقول السرّية المعلنة فقط (`merchantId`/`secretKey`). **التوسّع مستقبلياً هو نقطة الـ Registry (سطر `secretFields` إضافي) وليس حقولاً متوقَّعة داخل البصمة** — `apiKeyEnc` بصمة معتمة تُضاف إليها حقول بلا جراحة Schema، والتنميط محمول في مترّيكات `kind+engine` المفهرسة. لا `version`/`webhookSecret` غير مستخدم حتى خطوة الربط الفعلي (SA.5+).

### 7.3 قواعد إلزامية (تطابق AGENTS §9/§16) — كما نُفّذت

1. **التشفير:** يُشفَّر السرّ بواسطة `encryptSecret()` (AES-256-GCM بمفتاح `PAYMENT_CRYPTO_KEY`) ويُخزَّن في `IntegrationConfig.apiKeyEnc`.
2. **عدم الإرجاع (Zero-Leakage، قرار CTO):** لا يُعاد السرّ ولا جزء منه في **أي** استجابة أو سجل. يُعرض `hasKey: true|false` فقط — **لا `maskedKey` (حتى لا آخر 4 أحرف)** لاحترام §7.3/2 وتقليص سطح فك التشفير عند القراءة.
3. **التحقق من الملكية:** التأكد أن `hotelId` موجود (`404` إن لم يكن) — لا نُنشئ تكاملاً لفندق وهمي.
4. **السجلّ:** كل كتابة/حذف تُنتج `PlatformAuditLog` (القيم `oldValue/newValue` لأعلام غير حسّاسة فقط). `PlatformAuditLog.action/entity` عمودان نصّيّان — لا حاجة لتعديل Schema.
5. **سلسلة وسطاء الطفرات (إلزامية):** `withPlatformAuth(withCsrf(withRateLimit(handler)))` — والاستعلامات القرائية تكتفي بـ`withPlatformAuth(withRateLimit(...))`.
6. **المنطقة الزمنية للقراءة:** `GET` لا يكشف الأسرار المشفّرة، فقط `{ engine, kind, isActive, hasKey, config, updatedAt }` — مع `config` مُعاد تحليله (غير سرّي فقط).

### 7.4 تطوّر `IntegrationConfig` — ✅ مُنفَّذ (Migration `20260917140000_add_integration_kind`)

`IntegrationConfig` الحالي يحمل `engine` و`apiKeyEnc` و`config`. نُفّذ **دون كسر التوافق**:

- ✅ أُضيف `kind IntegrationKind @default(BOOKING_ENGINE)` (`enum IntegrationKind { BOOKING_ENGINE, PAYMENT_GATEWAY }`) — Backfill تلقائي: الصفوف القائمة `BOOKING_ENGINE`.
- ✅ أُضيف `updatedById String?` لتتبّع من عدّل المفاتيح.
- ✅ أُنشئ **سجل مزوّدين (Provider Registry)** `src/lib/integrations/registry.ts`: لكل `engine` ↦ `{ kind, secretFields, configFields, rawSecret }`؛ يُستخدم في الـAPI وفي الواجهة مستقبلاً (Schema-driven).

| المزوّد | `kind` | `secretFields` | `configFields` | racking |
|---|---|---|---|---|
| `plutu` | PAYMENT_GATEWAY | `merchantId`·`secretKey` | `baseUrl`·`returnUrl`·`callbackUrl`·`isSandbox` | حزمة JSON |
| `tlync` | PAYMENT_GATEWAY | `merchantId`·`secretKey` | `baseUrl`·`returnUrl`·`callbackUrl`·`isSandbox` | حزمة JSON |
| `booking.com` | BOOKING_ENGINE | `apiKey` | — | نصّ خام |
| `expedia` | BOOKING_ENGINE | `apiKey` | — | نصّ خام |
| `website` | BOOKING_ENGINE | `apiKey` | — | نصّ خام |
| `custom` | BOOKING_ENGINE | `apiKey` | — | نصّ خام |

> **نطاق SA.4 (قرار CTO):** التخزين + الـAPI فقط.
>
> **نطاق SA.4.5 (قرار CTO):** ربط المفاتيح المخزّنة بالتشغيل الفعلي — `payment-session` يقرأ من `IntegrationConfig` أولاً، والـ `webhook` يبقى على لقطة `gatewayConfig` (انظر §7.5).

### 7.5 ربط المفاتيح بالتشغيل (SA.4.5) — `resolveGatewayConfig`

**ترتيب الحل (قراءة DB واحدة بلا Cache — قرار معتمد):**

1. **الصف المخزَّن (`IntegrationConfig` بمرجع `hotelId+engine`, `kind=PAYMENT_GATEWAY`) هو المرجع:** فكّ `apiKeyEnc` → حزمة `{merchantId, secretKey}` تُصيغ الاعتماد، مع Overlay لحقول `baseUrl/returnUrl/callbackUrl` غير السرّية من `config`.
2. **لا Cache ولا TTL:** `findUnique` على مفتاح فريد ≈ أقل من 1ms بينما نداء البوابة 100–500ms — والأسرار يجب أن تعكس آخر كتابة من السوبر أدمن فوراً (تدوير/إبطال بلا نافذة متقادمة).
3. **حاجز أمني (لا عبور-مستأجر):** إن وُجد صف لكنه `isActive=false` أو `apiKeyEnc` مفقود/غير قابل للفك → **فشل** (400 `GATEWAY_CONFIG_UNAVAILABLE`) — **لا** عودة إلى `.env` أبداً في هذه الحالة (لا إعادة تفعيل لبوابة معطَّلة، ولا تسريب لمفاتيح هوية المنصة لفندق).
4. **Env-Fallback مشروط:** فقط **عند غياب صف كلياً** (تطوير + عدم كسر اختبارات ما قبل SA.4.5) — يدل على ذلك `source: 'db'|'env'` في نتيجة الحل.
5. **الـ Webhook يبقى على لقطة `PaymentSession.gatewayConfig`** (مفتاح التوقيع المحسوب لحظة الإنشاء) — تدوير المفتاح في منتصف جلسة `PENDING` لا يكسر الدفع؛ وهو مثبَّت باختبار `gateway-wiring` (§12/SA.4.5).

---

## 8) 🔑 متغيّرات البيئة الجديدة (Env)

| المتغيّر | الغرض | القيود |
|---|---|---|
| `SUPERADMIN_OTP_SECRET` | مفتاح HMAC لكود OTP + توقيع رمز التحدي | ≥ 32 حرفاً · **سرّي تماماً** · لا يبدأ بـ`NEXT_PUBLIC_` |
| `SUPERADMIN_OTP_TTL_SECONDS` | صلاحية الكود (افتراضي 600) | — |
| `SUPERADMIN_OTP_MAX_ATTEMPTS` | حد المحاولات (افتراضي 5) | — |
| `SUPERADMIN_OTP_RESEND_COOLDOWN_SECONDS` | تهدئة إعادة الإرسال (افتراضي 60) | — |
| `SUPERADMIN_STEP_UP_JWT_SECRET` | **SA.6 —** مفتاح توقيع `su_token` (Sudo Mode) | ≥ 32 حرفاً · **سرّي تماماً** · **مفتاح منفصل** عن ACCESS/REFRESH/OTP (فصل مفاتيح §SA.6/ج) · لا يبدأ بـ`NEXT_PUBLIC_` |
| `SUPERADMIN_STEP_UP_OTP_TTL_SECONDS` | **SA.6 —** صلاحية كود الـ Step-up (افتراضي 300، **مقصوصة بسقف صلب = نافذة السودو**) — انظر §SA.6/و | — |

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
- ❌ **منع** جعل `su_token` ذا استخدامٍ واحد أو تشكيله بلا نطاق (scope) — القرار المعتمد SA.6: **window-use** داخل نافذة السودو (خمس دقائق) **بنطاق صريح** `superadmin:integrations` (§SA.6/ب).

---

## 10) 🧭 خطة التنفيذ والمراحل

| المرحلة | المخرجات | الحالة |
|---|---|---|
| **SA.1 — Foundation** | هذا المستند + تعديلات `schema.prisma` + Migration | 🟢 **مُنجَز** |
| **SA.2 — Auth Core (Backend)** | `SuperAdminOtpService`، مسارات `/api/superadmin/auth/{login,verify-otp,resend-otp}`، `tv` في `AccessTokenPayload`/`RefreshTokenPayload`، شرط `tv` في الـ Middleware + `superadmin-cookie`، `withPlatformAuth`، `recordPlatformAudit`، اختبار تكاملي | 🟢 **مُنجَز** (بلا واجهة) |
| **SA.3 — Isolation** | نقل الصفحات إلى `(superadmin)`، استثناءات الدخول في الـ Middleware (عند وجود الصفحات)، استبدال الحاجز العميلي | 🟢 **مُنجَز ضمن SA.5** |
| **SA.4 — Integration API** | `api/superadmin/integrations` (GET/POST/DELETE) + Provider Registry + تطور `IntegrationConfig` (الحراسة `withPlatformAuth` جاهزة) | 🟢 **مُنجَز** (بلا واجهة) |
| **SA.4.5 — Gateway Wiring** | `resolveGatewayConfig` (DB-first + env-fallback مشروط بلا Cache) في `payment-session` · بقاء الـ webhook على لقطة `gatewayConfig` · `tests/integration/gateway-wiring.test.ts` | 🟢 **مُنجَز** |
| **SA.5 — UI (Auth Screens + Dashboard Gate)** | شاشة الدخول (factor 1) + شاشة OTP (Server-Component guard + 6 خانات + إعادة إرسال بتهدئة) + هيكل `(auth)`/`(dashboard)` · حاجز لوحة التحكم من الخادم (بلا `localStorage`) · `POST /api/superadmin/auth/logout` · استثناءات Middleware + اعتراض `SUPER_ADMIN` في `/auth/login` · الملعب 42/42 | 🟢 **مُنجَز** (لوحة مفاتيح التكامل Schema-driven في SA.7) |
| **SA.6 — Hardening** | Step-up للعمليات الحسّاسة، اختبارات أمنية، توثيق README | 🟢 **مُنجَز** (باك اند + اختبارات أمنية؛ **واجهة الـ Sudo** مؤجَّلة لـ SA.7) |

---

## 11) 🔗 مراجع

- `apps/web/AGENTS.md` §9 (الأسرار) · §10 (الجلسات) · §11 (RBAC وعزل المنصة) · §13 (التوثيق الحيّ) · §16 (أمان التكاملات).
- `apps/web/prisma/schema.prisma` — `User` · `IntegrationConfig` · `AuditLog`.
- `apps/web/src/middlewares/auth.ts` · `superadmin-cookie.ts` · `csrf.ts` · `rate-limit.ts` · `sudo-mode.ts` (SA.6).
- `apps/web/src/lib/utils/jwt.ts` · `crypto.ts` · `password.ts`.
- `apps/web/src/lib/services/auth.service.ts` · `src/app/api/auth/login/route.ts`.
- `apps/web/src/app/api/superadmin/auth/step-up/{request,verify}/route.ts` (SA.6).
- `apps/web/src/lib/gateways/email.gateway.ts`.
- `docs/SECURITY-LOCAL-GATEWAYS.md` · `docs/CONTRACT-TESTING-ARCH.md` · `docs/E2E-TESTING-ARCH.md` §14 (E2E.1.6).

---

## 12) ✅ ما تم بناؤه فعلياً (SA.1 + SA.2/SA.2.5 + SA.4 + SA.4.5 + SA.5 + SA.6)

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
| `apps/web/src/lib/utils/otp.ts` | `generateOtpCode()` (randomInt) · `hashOtpCode()` (HMAC-SHA256 ببيبّر) · `safeEqualHex` (timingSafeEqual) · `maskEmail` · دوال إعدادات TTL/محاولات/تهدئة إعادة الإرسال |
| `apps/web/src/lib/utils/jwt.ts` | `tv?` في `AccessTokenPayload` **و**`RefreshTokenPayload` · `signOtpChallengeToken`/`verifyOtpChallengeToken` (نطاق `superadmin:otp`) بمفتاح خاص |
| `apps/web/src/lib/services/superadmin-otp.service.ts` | `requestOtp` (إبطال التحدي السابق، توليد+هش+بريد، إرجاع البصمة لا الكود) · `verifyOtp` (انتهاء/استهلاك/محاولات + **إغلاق الحساب 15 دقيقة عند النفاد**) · **`resendOtp` (SA.2.5 —** هوية من الكوكي، CoolDown أرضي `lastCodeSentAt ?? createdAt`، إبطال الكود السابق + صفر محاولات + تمديد صلاحية **في نفس صف التحدي**)** |
| `apps/web/src/lib/services/platform-audit.service.ts` | `recordPlatformAudit()` → `PlatformAuditLog` |
| `apps/web/src/lib/services/auth.service.ts` | `authenticateCredentials()` (عزل عامل الباسورد) · `issueSession(user,{tv})` · الحفاظ على `tv` عبر التجديد |
| `apps/web/src/app/api/superadmin/auth/login/route.ts` | عامل1: فحص الباسورد فقط، رفض **الحسابات بلا 2FA** (403)، إرسال OTP + كوكي `sa_otp` (HttpOnly/strict/path-scoped) + تدقيق — `withRateLimit(10)` |
| `apps/web/src/app/api/superadmin/auth/verify-otp/route.ts` | عامل2: `withCsrf` + سقف Redis (fail-open) + استهلاك التحدي → `issueSession({tv:true})` + مسح `sa_otp` + تدقيق |
| `apps/web/src/app/api/superadmin/auth/resend-otp/route.ts` | **SA.2.5 —** إعادة إرسال: هوية من الكوكي `sa_otp` لا من الجسم، `withCsrf` + سقف Redis `3/5min` (fail-open) + `resendOtp` + إعادة إصدار الكوكي بصلاحية ممدَّدة + `Retry-After` على التهدئة + تدقيق |
| `apps/web/prisma/migrations/20260918000000_add_otp_resend_cooldown/` | **SA.2.5 —** `OtpChallenge.lastCodeSentAt` (أساس التهدئة) |
| `apps/web/src/middleware.ts` | `/superadmin` و`/admin/queues` تشترطان `role==='SUPER_ADMIN'` **و**`tv===true` |
| `apps/web/src/middlewares/superadmin-cookie.ts` | الحاجز البكري ينضاف له شرط `tv` (Bull Board) |
| `apps/web/src/middlewares/platform-auth.ts` | بوّابة API تحت `/api/superadmin/*` (Bearer أو كوكي الجلسة) + `tv` |
| `apps/web/scripts/test-superadmin-otp.ts` | اختبار تكاملي شامل (**42 فحصاً** — SA.2 الأساس + إعادة الإرسال + حاجزات صفحات SA.5 + تسجيل الخروج) — `npm run test:superadmin-otp` |
| `.env.example` / `apps/web/package.json` | متغيرات OTP جديدة (`…_RESEND_COOLDOWN_SECONDS` ضمنها) + سكربت `test:superadmin-otp` |

**نتيجة الاختبار التكاملي (SA.2/SA.2.5):** 30/30 فحص بلا أخطاء (فشل الباسورد، توليد التحدي، رفض الكود الخاطئ+عدّ المحاولة، **نجاح إعادة الإرسال + تمديد الصلاحية + رفض التهدئة 429 مع `Retry-After` + إبطال الكود القديم + رفض بلا كوكي/كوكي تالف + سجل التدقيق**، نجاح `tv=true`، إغلاق الحساب، رفض الدخول بعد القفل). `tsc --noEmit` نظيف، `README`/السجلات متزامنة، والاختبارات الشاملة 284/284 تمر.

### SA.4 — Integration API (Backend خالص)

| الملف | التغيير |
|---|---|
| `apps/web/prisma/schema.prisma` | `enum IntegrationKind` + `kind` (default `BOOKING_ENGINE`) + `updatedById` على `IntegrationConfig` + فهرس `kind` |
| `apps/web/prisma/migrations/20260917140000_add_integration_kind/` | Migration SQL (مطبَّقة عبر `db execute` + `migrate resolve`) |
| `apps/web/src/lib/integrations/registry.ts` | **سجل المزودين**: `engine ↦ { kind, secretFields, configFields, rawSecret }` + دوال `validateSecretShape`/`pickConfigFields` — نقطة التوسّع الوحيدة للأسرار الجديدة |
| `apps/web/src/app/api/superadmin/integrations/route.ts` | `GET` (مُقنّع، `hasKey` فقط، فلترة `kind`، 404 لفندق مجهول) · `POST` (upsert؛ بوابات → حزمة JSON مشفّرة، محركات حجز → نصّ خام مشفّر لتوافق `withExternalAuth`؛ `updatedById`؛ تدقيق) · `DELETE` (حذف دائم + إبطال مفاتيح + تدقيق). الحراسة `withPlatformAuth(withCsrf(withRateLimit()))` للطفرات، `withPlatformAuth(withRateLimit())` للقراءة |
| `apps/web/scripts/test-superadmin-integrations.ts` | اختبار تكاملي شامل (26 فحصاً) — `npm run test:superadmin-integrations` |
| `apps/web/package.json` | سكربت `test:superadmin-integrations` |

> **القرارات المعتمدة من الإدارة التقنية (SA.4):**
> 1. **الـ Masking في GET = `hasKey` فقط** (Zero-Leakage، لا `maskedKey` — §7.3/2).
> 2. **تعديل Schema** (kind + updatedById + Backfill `BOOKING_ENGINE`) اعتمد.
> 3. **نطاق SA.4 = التخزين + الـAPI فقط**؛ الربط بالتشغيل الفعلي (payment-session/webhook) خطوة لاحقة.
> 4. **الحزمة المشفّرة محصورة** في `{merchantId, secretKey}` — التوسّع عبر الـ Registry لا داخل البصمة.
> 5. حذف التكامل على **مستوى المجموعة** (`DELETE ?hotelId=&engine=`) بدل `/[id]` كما طلبت الإدارة.

**نتيجة الاختبار التكاملي:** 26/26 فحص بلا أخطاء (توليد بوابة دفع → حزمة JSON مشفّرة مع جولة فكّ صحيحة، توافق المحركات الخام خلفياً، صفر تسريب في كل الاستجابات، أخطاء 400/404/422، رفض بدون `tv` (403) وبدون مصادقة (401)، حذف دائم مع سجل تدقيق). SA.2 20/20، الاختبارات الشاملة 274/274، `tsc --noEmit` نظيف.

### SA.4.5 — ربط مفاتيح بوابات الدفع (Gateway Wiring, Backend)

| الملف | التغيير |
|---|---|
| `apps/web/src/lib/integrations/gateways/gateway-config.ts` | **جديد**: `resolveGatewayConfig(gateway, { hotelId, override? })` — الصف المخزَّن مرجع (فكّ حزمة `{merchantId, secretKey}` + overlay حقول غير سرّية)، **بلا Cache**، رفض عند `isActive=false` أو سرّ ناقص (لا النجوع إلى `.env`)، و`env` فقط عند غياب الصف. `GatewayConfigReadError` + رسائل عربية |
| `apps/web/src/lib/integrations/gateways/gateway-factory.ts` | `GatewayAdapterOptions` تُكسب `hotelId`؛ `createPaymentSession(request, resolvedConfig?)` — إن غاب config صريح يحلّ تلقائياً من الـ DB عبر الفندق، ويبقى التجاوز الصريح (`opts.config`) أولوية قصوى للاختبارات |
| `apps/web/src/app/api/public/bookings/[id]/payment-session/route.ts` | حلّ الاعتماد عبر `resolveGatewayConfig(gateway, { hotelId: booking.hotelId })` قبل بناء الطلب واللقطة؛ 400 `GATEWAY_CONFIG_UNAVAILABLE` عند فشل الحل؛ تمرير الـ config المحلول نفسه لنداء البوابة ولقطة `gatewayConfig` (ذرة واحدة بلا نافذة تدوير بين التوقيع واللقطة) |
| `apps/web/src/app/api/external/gateways/[provider]/webhook/route.ts` | **بلا تغيير معماري** — يبقى يتحقق من لقطة `PaymentSession.gatewayConfig` أولاً ثم `.env` كملاذ أخير (تصميم مثبت) |
| `apps/web/tests/integration/gateway-wiring.test.ts` | **جديد**: 10 فحوص — الصف المخزَّن يتغلب على env (`source:'db'`)، غياب الصف → env، رفض عند `isActive=false`/سرّ ناقص، tlync يطابق السلوك، الـ Adapter بذاكرة `hotelId` يحلّ لوحده، التدفق الكامل (نداء + لقطة)، **تدوير المفتاح في منتصف الجلسة والـ Webhook بالمفتاح القديم يمر** (برهان الـ Snapshot)، رفض 400 بلا نداء ولا env-leak، ومسار env القديم يبقى |

> **القرارات المعتمدة من الإدارة التقنية (SA.4.5):**
> 1. **بلا Cache** — قراءة DB لكل استدعاء (فريد ≈1ms؛ الأسرار تعكس آخر كتابة فوراً؛ التردد دفعة/قرار حرِج).
> 2. **الـ Webhook يبقى على اللقطة** — تدوير مفتاح أثناء `PENDING` يجب ألا يكسر دفعاً في العبور؛ الربط الحي بالـ `IntegrationConfig` يرفض توقيعاً موقَّعاً بالمفتاح القديم (حفرة Config Mutation الموثّقة في `SECURITY-LOCAL-GATEWAYS.md`).
> 3. **Env-fallback مشروط بغياب الصف** — صف قائم معطَّل/ناقص = فشل وليس نجوعاً إلى `.env` (لا عبور-مستأجر ولا إعادة تفعيل صامتة).

**نتيجة الاختبار التكاملي:** `tests/integration/gateway-wiring.test.ts` 10/10 بلا أخطاء (بما فيها برهان التدوير/اللقطة والرفض الأمني وإثبات وصول env creds للبوابة في مسار الإرث). SA.4 26/26، SA.2 20/20، الاختبارات الشاملة **284/284**، `tsc --noEmit` نظيف.

### SA.5 — واجهة الدخول الثنائي + حاجز لوحة التحكم (UI, Server-Side)

| الملف | التغيير |
|---|---|
| `apps/web/src/app/api/superadmin/auth/{login,verify-otp,resend-otp}/route.ts` | **`OTP_COOKIE_PATH = '/'`** لرمز التحدي (SA.5) — يجب أن يصل إلى صفحة `/superadmin/otp` **و**مسارات `/api/superadmin/auth/*` معاً (انظر تبرير §5.1) |
| `apps/web/src/middleware.ts` | استثناء `/superadmin/login` + `/superadmin/otp` (مسارا ما قبل المصادقة) · جلسة موثّقة بالكامل عليهما ← تحويل إلى `/superadmin` · كل بقيّة `/superadmin/*` و`/admin/queues` بلا `tv` ← تحويل إلى **`/superadmin/login`** (وليس `/auth/login`) |
| `apps/web/src/app/(superadmin)/superadmin/(auth)/layout.tsx` | **جديد** — إطار البطاقة المركزية (بلا Sidebar) لشاشتي الدخول وOTP |
| `apps/web/src/app/(superadmin)/superadmin/(auth)/login/{page,login-form}.tsx` | **جديد** — شاشة العامل الأول: `loginSchema` + `POST /api/superadmin/auth/login` → توجيه إلى `/superadmin/otp` (الكوكي تلقائياً معه) |
| `apps/web/src/app/(superadmin)/superadmin/(auth)/otp/page.tsx` | **جديد** — **Server Component = الحاجز الحاسم**: `cookies().get('sa_otp')` → `verifyOtpChallengeToken` → استعلام `OtpChallenge` (حيّ، غير مستهلك) + `User.twoFactorEnabled` → أي فشل `redirect('/superadmin/login')` فوراً. لا يوجد بروب Client "هل أنا مصرَّح؟" |
| `apps/web/src/app/(superadmin)/superadmin/(auth)/otp/{otp-form.tsx, otp-input…}` | **جديد** — نموذج 6 خانات (`useOtpInput`): تحقق تلقائي عند اكتمال الرقم، اهتزاز للكود الخاطئ، عدّاد انتهاء الصلاحية + تهدئة إعادة الإرسال، `Retry-After` محترم، إعادة توجيه بعد الأخطاء الختامية |
| `apps/web/src/hooks/use-otp-input.ts` | **جديد** — Hook بلا اعتماديات: تنقية رقمية، تقدّم بؤري، مسح خلفي، أسهم، لصق كامل |
| `apps/web/src/app/(superadmin)/superadmin/(dashboard)/layout.tsx` | **جديد** — حاجز لوحة التحكم **Server Component**: يؤكد `accessToken` + `role==='SUPER_ADMIN'` + `tv===true` + وجود المستخدم في DB ثم يرسم الهيكل (Sidebar + Tabs). **لا يوجد `localStorage`** (AGENTS §10) |
| `apps/web/src/app/(superadmin)/superadmin/(dashboard)/{shell,sign-out-button,page}.tsx` | **جديد** — الهيكل (Sidebar يمين + تبويبات + بطاقة مستخدم) · سياسة خروج (POST ثم انتقال كامل) · صفحة ترحيب «لوحة التحكم العليا» |
| `apps/web/src/app/api/superadmin/auth/logout/route.ts` | **جديد** — إبطال الجلسة: `verifyAccessToken`/`verifyRefreshToken` من الكوكيز → `authService.logout(userId, family)` → مسح `accessToken`/`refreshToken`/`sa_otp` → تدقيق. `withCsrf`، إخفاق ثنائي (بلا ذعر على كوكي تالف) |
| `apps/web/src/app/auth/login/page.tsx` | عند رصد `SUPER_ADMIN` يوجَّه إلى **`/superadmin/login`** (لا `/superadmin`) — لا تقصير لمسار 2FA |
| `apps/web/src/styles/globals.css` | `.otp-input` + `otp-shake` + `otp-fade-in` + احترام `prefers-reduced-motion` |
| `apps/web/scripts/test-superadmin-otp.ts` | +12 فحصاً (SA.5): حاجزات صفحات (بلا كوكي/كوكي تالف/تحدي حيّ/جلسة موثّقة كاملة)، **logout** (رفض بلا CSRF، إبطال، رفض تدوير الـ Refresh بعده) — **42/42** |

> **القرارات المعتمدة من الإدارة التقنية (SA.5):** (1) لوحة تحكم مؤقتة = بطاقة ترحيب + زر خروج فعّال؛ (2) تخطيط مكعّب: شاشات `(auth)` بطاقات مركزية بلا Sidebar ← هيكل كامل (`(dashboard)`) عبر `layout.tsx` متداخل؛ (3) `/auth/login` القديم يعترض دور `SUPER_ADMIN` ← `/superadmin/login`. تفاعلات النموذج: بسيطة (اهتزاز خاطئ، تلاشي خطأ، مؤشر تحميل، `prefers-reduced-motion`).

**نتيجة الاختبار التكاملي (SA.5):** 42/42 فحص بلا أخطاء (كل حاجزات صفحات SA.5 + تسجيل خروج كامل + إعادة تشغيل النتيجة الكاملة SA.2/SA.2.5). `tsc --noEmit` نظيف، `next lint` بلا أخطاء جديدة، الاختبارات الشاملة **284/284** تمر.

### SA.6 — Sudo Mode / Step-up Authentication (Backend خالص + اختبارات أمنية)

**الفكرة:** افصل «من هو الطالب؟» (`withPlatformAuth` — جلسة + 2FA) عن «هل يجب رفع الصلاحية لهذه العملية؟» (`withSudoMode`). الطفرات على `/api/superadmin/integrations` (POST/DELETE) تشترط `su_token` سليم المنتهي الصلاحية في رأس `x-sudo-token`؛ `GET` خارج السودو كما هو.

| الملف | التغيير |
|---|---|
| `apps/web/src/lib/utils/otp.ts` | `SUDO_WINDOW_SECONDS = 300` + `getStepUpTtlSeconds()` — **سقف صلب** ≤ نافذة السودو (كود الـ Step-up لا يعيش أطول من البطاقة التي يفتحها) |
| `apps/web/src/lib/services/superadmin-otp.service.ts` | `requestOtp` يقبل `customTtl?` (مسار الدخول بلا تغيير) · **`requestStepUpOtp`** (غرض `SUPER_ADMIN_STEP_UP`، إنهاء تحدي السودو السابق، بريد بسياق Step-up عبر `deliverCode(template:'step-up')`) · **`verifyStepUpOtp`** (نفس قوس المحاولات/القفل/الاستهلاك، `StepUpOtpVerifyResult` مُصدَّر) |
| `apps/web/src/lib/utils/jwt.ts` | `getSudoTokenSecret()` + `SUDO_SECRET` منفصل · `SudoTokenPayload` · `signSudoToken`/`verifySudoToken` (HS256؛ `sub`=userId، `scope:'superadmin:integrations'`، `purpose`، `jti`، `iat`، `exp = now + SUDO_WINDOW_SECONDS`) |
| `apps/web/src/middlewares/sudo-mode.ts` | **جديد — `withSudoMode`**: يُلصق **بعد** `withPlatformAuth` (يحتاج `request.user.userId`). بلا رأس → `403 STEP_UP_REQUIRED`؛ تحقق فاشل (توقيع/انتهاء) → `403 STEP_UP_EXPIRED` + تدقيق `STEP_UP_EXPIRED_REJECTED` **فقط عند وجود رأس**؛ نطاق ≠`superadmin:integrations` أو `sub`≠userId → `403 STEP_UP_REQUIRED` (بلا ضجيج تدقيق)؛ نجاح → تدقيق `STEP_UP_USED` (`entityId = jti`) ثم `handler` |
| `apps/web/src/app/api/superadmin/auth/step-up/request/route.ts` | **جديد** — `POST` بجلسة `tv:true` + `withCsrf` + `checkRateLimit(3/15min)` (Redis fail-open) → إرسال كود + تدقيق `STEP_UP_OTP_REQUESTED` |
| `apps/web/src/app/api/superadmin/auth/step-up/verify/route.ts` | **جديد** — `POST` بجلسة `tv:true` + `withCsrf` + `checkRateLimit(5/60ث)` → تحقّق → إصدار `su_token` + تدقيق `STEP_UP_OTP_VERIFIED`/`STEP_UP_OTP_FAILED_<REASON>` |
| `apps/web/src/app/api/superadmin/integrations/route.ts` | `POST`/`DELETE` → `withPlatformAuth(withSudoMode(withCsrf(withRateLimit(handler, 30))))` · `GET` يبقى `withPlatformAuth(withRateLimit(handler, 60))` (خارج السودو) |
| `.env.example` | `SUPERADMIN_STEP_UP_JWT_SECRET` + `SUPERADMIN_STEP_UP_OTP_TTL_SECONDS="300"` |
| `apps/web/scripts/test-superadmin-otp.ts` | **+21 فحصاً (SA.6)** — 403 بلا سودو، window-use (3 عمليات ببطاقة واحدة)، تزويرات (مفتاح خاطئ/منتهي/نطاق/موضوع)، `customTtl:120` للخدمة، سجل التدقيق الكامل — **62/62** مع `process.exit` نظيف |
| `apps/web/tests/e2e/superadmin-step-up.spec.ts` | **جديد — E2E.1.6** (تفاصيله في `docs/E2E-TESTING-ARCH.md` §14): رحلة سودو كاملة + رفض شامل للتزوير (تزوير عبر `jose`) |

> **القرارات المعتمدة من الإدارة التقنية (SA.6):**
> 1. **حارس مركّب لا مُعدَّل:** `withSudoMode` يُلصق بعد `withPlatformAuth` — الطبقات منفصلة (الهوية أولاً، الصلاحية السودو ثانياً).
> 2. **`su_token` عديم الحالة بنافذة استخدام (window-use) لا single-use:** عمليات حسّاسة غير محدودة داخل الخمس دقائق, بلا تجديد؛ مفتاح توقيع **منفصل** (`SUPERADMIN_STEP_UP_JWT_SECRET`).
> 3. **عقوبة توقيع منفصلة عن العقوبة الدلالية:** توقيع/انتهاء → `STEP_UP_EXPIRED` + تدقيق رفض (يُقيس محاولات الهجوم)؛ نطاق/موضوع → `STEP_UP_REQUIRED` (بلا ضجيج).
> 4. **سقف TTL صلب:** كود Step-up يُقصوص إلى نافذة السودو مهما مُرِّر `SUPERADMIN_STEP_UP_OTP_TTL_SECONDS`.
> 5. **صفر Schema:** `OtpPurpose.SUPER_ADMIN_STEP_UP` موجود مسبقاً؛ `PlatformAuditLog.action` حرّ النص.

**نتيجة الاختبار التكاملي (SA.6):** `npm run test:superadmin-otp` → **62/62** (21 فحصاً SA.6) وخروج `0` نظيف؛ `npm run test:e2e` → **11/11** (البنية 4 + مصادقة 5 + سودو 2 — بـ `demoteSessionCookies` لحفرة `Secure`-كوكي/`page.request`، §E2E-TESTING-ARCH 14.1). `tsc --noEmit` نظيف، `next lint` بلا أخطاء جديدة.

> **✅ ملاحظة انتقالية حُلَّت (SA.5):** كانت جلسات السوبر أدمن القديمة (قبل SA.2) بلا `tv` فيرتّها الـ Middleware إلى `/auth/login` التي لا تدرك 2FA فتُعيد المستخدم إلى `/superadmin` (حلقة). الآن: `/superadmin/login` + `/superadmin/otp` مبنيتان ومربوطة باعتراض `SUPER_ADMIN` في `/auth/login`، والـ Middleware تعيد التوجيه إلى `/superadmin/login` نفسه — الحلقة مغلقة.
