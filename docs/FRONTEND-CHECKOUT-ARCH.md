# وثيقة المعمارية التنفيذية — واجهة الدفع المباشر (Frontend Checkout Flow)

> **الحالة:** حيّة (As-Built) — تعكس ما تم برمجته فعلياً في M0→M6، وليست مجرد مقترح.

## 🎯 الهدف
واجهة دفع آمنة للضيوف على صفحة الحجز المباشر، تدعم:
- **Plutu / T-Lync** (إعادة توجيه لبوابة خارجية عبر جلسة `PaymentSession`)
- **Bank Transfer / Cash** (تعليمات دفع يدوي عند الوصول — بدون إنشاء جلسة)

---

## 1️⃣ استراتيجية إدارة الحالة (State Management) — كما نُفّذت

### القرار: **URL = مصدر الحقيقة للخطوات، Context محدود = جلسة الدفع فقط**

| الطبقة | الأداة | المسؤولية |
|--------|--------|-----------|
| **الخطوة (Step)** | `next/navigation` + URL Search Params | `?step=select-gateway\|redirecting\|bank-transfer\|cash\|success\|failed`، `?gateway=...` |
| **جلسة الدفع** | `React.createContext` (`CheckoutContext`) | `sessionData` + `loading` + `error` + setters |
| **التنقل الكتابي** | `router.replace(..., { scroll: false })` | تحديث `?step=` بدون تمرير سجلّات Back غير مرغوبة |

### القرارات الهندسية الملزمة (عُدّلت بعد المراجعة التقنية):
1. **الـ Context لا يحمل `step`**: الخطوة تُقرأ حصرياً من الـ URL (ناجٍ من Refresh/مشاركة/Back-Forward).
2. **الـ Context لا يحمل `booking`/`hotel` كبيانات قابلة للتعديل**: قيمة ثابتة تُمرَّر من الـ Server Component؛ المحرّك (CheckoutClientInner) يمتلك الـ handlers.
3. **لا مكتبة State خارجية** (Zustand/Redux): primitives من React تكفي.

### التقسيم المقصود بين URL و Context:
- **URL** = «في أي خطوة أنا» (السلطة الوحيدة لمسار الدفع).
- **Context** = «ما الجلسة التي أنشأتها؟» (بيانات `PaymentSession` الفعلية الموسومة بـ `paymentSessionId`) + حالة التحميل والخطأ.

```tsx
// CheckoutClient.tsx — القراءة من الـ URL
const step = (searchParams.get('step') as CheckoutStep) ?? 'select-gateway';
const urlGateway = searchParams.get('gateway') as Gateway | null;

// الكتابة إلى الـ URL
goToStep('redirecting', gateway); // → router.replace(`?step=redirecting&gateway=${gateway}`, { scroll: false })
```

---

## 2️⃣ هندسة المكونات (نُفّذت فعلاً)

```
checkout/
├── page.tsx                # Server Component — يجلب Booking+Folio+Hotel+Guest (select فقط) + بوابة نجاح أمنية
├── CheckoutClient.tsx      # 'use client' — CheckoutProvider + CheckoutClientInner (قراءة/كتابة الـ URL، handlers)
├── context/PaymentSessionContext.tsx  # الأنواع المشتركة + CheckoutContextValue
└── components/
    ├── CheckoutLayout.tsx      # RTL Header + المبلغ المستحق + ProgressSteps + Footer
    ├── ProgressSteps.tsx       # مؤشر الخطوات
    ├── GatewaySelector.tsx     # بطاقات الاختيار (Plutu/T-Lync/Bank/Cash) + Overlay تحميل
    ├── GatewaySelectorCard.tsx # بطاقة واحدة (memo) — استدعاء onSelect(gateway.id)
    ├── RedirectingView.tsx     # زر توجيه صريح (بدون Countdown) + حالة «جلسة غير متوفرة»
    ├── BankTransferView.tsx    # IBAN/SWIFT/مرجع ثابت (useState initializer) + نسخ + طباعة
    ├── CashView.tsx            # تعليمات دفع نقدي عند الوصول
    ├── SuccessView.tsx         # (تُعرض من الـ Server فقط بعد التحقق) — بدون confetti
    ├── UnverifiedSuccessView.tsx # 'use client' — رسالة التعذر + Auto-revalidation (M6)
    └── FailedView.tsx          # إعادة المحاولة / تغيير الطريقة
```

**ملاحظات تنفيذ:** `CheckoutProvider` يحتفظ بالحالة، و`CheckoutClientInner` يملك كل الـ handlers (`createPaymentSession`, `handleGatewaySelect`, `handleRetry`, `handleBackToGatewaySelect`) ويستهلكها من الـ Context — لا تكرار ولا `useState` مُراوغ.

---

## 3️⃣ تدفق الخطوات (النُهج الفعلي)

| الخطوة | URL | الوصف |
|--------|-----|-------|
| اختيار البوابة | `?step=select-gateway` (افتراضي) | `GatewaySelector` |
| توجيه إلكتروني | `?step=redirecting&gateway=plutu` | إنشاء جلسة **أولاً** ثم التوجيه بضغطة صريحة |
| بنكي / نقدي | `?step=bank-transfer` / `?step=cash` | بدون أي استدعاء API — تعليمات فقط |
| نجاح | `?step=success` | **مغلقة بالخادم** — لا تُعرض إلا بجلسة `SUCCEEDED` موثّقة (انظر §5) |
| فشل | `?step=failed` | `FailedView` — `onRetry` يعيد إنشاء الجلسة بنفس البوابة |

```tsx
// CheckoutClient.tsx — فرع اختيار البوابة
if (gateway === 'plutu' || gateway === 'tlync') {
  createPaymentSession(gateway);          // POST → 201 → goToStep('redirecting')
} else {
  goToStep(gateway, gateway);             // 'bank-transfer' | 'cash' — بدون جلسة
}
```

**قرار الإدارة:** لا Countdown التلقائي — زر صريح «الانتقال للبوابة الآن»، مع رسالة «ستنتهي الجلسة خلال 30 دقيقة».

---

## 4️⃣ مكتبات UI (القرار النهائي بعد مراجعة الإدارة)

> **تقيد مطلق بالمكتبات المعتمدة: `shadcn/ui` + `Tailwind` فقط.** أي إضافة تتطلب موافقة صريحة.

| الحاجة | النهج الفعلي |
|--------|--------------|
| **Components** | `@/components/ui` (Button/Input/...) الحالية — بلا إضافات |
| **Toast** | **لا Sonner** — أخطاء إنشاء الجلسة تذهب مباشرة إلى `?step=failed` (عرض inline) |
| **Countdown** | لا عداد — زر صريح |
| **QR Code / Confetti** | **لا `qrcode.react` ولا `canvas-confetti`** — مستبعدان نهائياً |
| **الأيقونات/الـ SVG** | SVG مضمّن محلياً (لا مكتبة أيقونات) |

**لا توجد أي `dependencies` جديدة** أُضيفت في M0/M1/M2.

---

## 5️⃣ الأمان — بوابة النجاح (Success Gate) [M2 — ثغرة UI Spoofing]

### المشكلة:
الاعتماد على `?step=success` في الـ Client يسمح للمستخدم بكتابة الرابط يدوياً فيظهر ناجحاً زوراً (رغم أن الـ Backend لا يحصّل أي شيء إلا عبر الـ Webhook).

### الحل المعتمد: **تحقق Server-Side عند الطلب (Request-Time Verification)**

لت لا تستخدم الـ Client لحكم الحالة (أي فحص Client-side — Polling أو Server Action بعد العرض — قابل للتجاوز من مستخدم يتحكم بالمتصفح). بدلاً من ذلك:

1. `page.tsx` تقرأ `searchParams.step` **على الخادم** (خصيصة `searchParams` prop في App Router).
2. عند `step === 'success'` تستعلم الـ DB:
   ```ts
   prisma.paymentSession.findFirst({
     where: { bookingId, status: 'SUCCEEDED', ...(sessionId ? { id: sessionId } : {}) },
     orderBy: { createdAt: 'desc' },
     select: { amount: true, currency: true, method: true },
   });
   ```
   - لا يمكن تزييف `SUCCEEDED` لأنه لا يُكتب إلا عبر الـ Webhook المحقّق (Signature + IP whitelist Fail-Closed).
   - ربط `bookingId` بمعرّف الحجز في الرابط يمنع استخدام جلسة ناجحة تخص حجزاً آخر.
3. إن وُجدت جلسة ناجحة → تُعرض `SuccessView` (من الخادم) بالمبلغ/العملة الفعليين للجلسة.
4. إن لم تُوجد → تُعرض **`UnverifiedSuccessView`** (رسالة تعذّر التأكيد + إعادة تحقق/عودة).
5. **الـ Client لا يملك أي مسار لعرض النجاح**: الفرع `step === 'success'` في `CheckoutClient` يعرض «حالة غير مؤكدة» فقط (Defense-in-Depth).

### التحقق التلقائي الذكي (Auto-revalidation) [M6 + Hotfix]

`UnverifiedSuccessView` مكوّن عميل (`'use client'`). الجولة الأولى استخدمت `router.refresh()` داخل حلقة كل 3 ثوانٍ — **Anti-Pattern (RSC Spam Trap)**: كل نبضة تعيد حساب وإرسال كامل شجرة الـ RSC Payload (Self-DDoS). **التصحيح:** **Lightweight Polling** لنقطة نهاية ثقيلة-خفيفة، والتحديث المعماري يتم **مرة واحدة فقط** عند النجاح:

- `page.tsx` (عند `?step=success` غير موثّق) تمرّر `sessionId` = أحدث جلسة دفع للحجز إلى `UnverifiedSuccessView`.
- `UnverifiedSuccessView` يستعلم **`GET /api/public/bookings/{id}/payment-session/{sessionId}/status`** كل **3 ثوانٍ** (حد أقصى **5 محاولات**) — endpoint مصمم خصيصاً لهذا:
  - استعلام واحد مفهرس على `PaymentSession` (`bookingId` + `id`) — لا جلب غرافات ولا أي RSCpayload.
  - يعيد `{ verified: boolean }` فقط (المصدر الوحيد للـ `true` هو `status === 'SUCCEEDED'` المكتوب عبر الـ Webhook المحقّق).
  - `404` لحالة غير موجودة/غير تابعة للحجز، وتقييد عبر **Rate Limit** `30/دقيقة` للحجز + IP (نفس بنية `payment-session POST` لكن بحد أرحب يسمح بالاستطلاع).
- **عند `verified: true` → `router.refresh()` مرة واحدة فقط** لقلب الشجرة الخادمية إلى `SuccessView` (الخادم نفسه يعيد تقييم البوابة عند استلام الطلب مجدداً).
- بعد 5 محاولات يتوقف الاستطلاع، يظهر زر **«إعادة التحقق»** اليدوي بارزاً (يعيد ضبط العداد ويعيد تشغيل الدورة)، بجانب رابط العودة لصفحة الدفع.
- **الأمان لم يتغير:** الـ poll مجرد قراءة حالة، والحسم النهائي يبقى على الخادم وقت الطلب — الـ Client لا يملك مسار نجاح ولا يمكنه تزوير `SUCCEEDED`.

**لماذا `GET status` ثم `refresh()` واحدة وليست دورة `refresh()`؟** الاستطلاع يقيس «هل تغيّرت الحالة؟» بحمولة صغيرة (بايتات معدودة)، بينما `router.refresh()` يعيد حساب كامل شجرة الصفحة (RSC). التكرار فقط على «سؤال الحالة» — الإجابات تتغير فقط مرة واحدة، وعندها فقط ندفع الثمن الكامل للتبديل.

### لماذا ليس Polling ولماذا ليست Server Action؟
- **Polling (Client)**: قابل للتجاوز (المستخدم يستدعي الـ endpoint ويقرأ النتيجة بنفسه ثم يعدّل الـ DOM)، ويضيف شبكة زمنية دون فائدة أمنية.
- **Server Action في `SuccessView`**: تبدأ العرض قبل التحقق (لحظة عرض زائفة)، والتحقق بعد العرض لا يمنع «تأكيداً زائفاً»، وهي موجهة للمتغيرات (Mutations) وليست للقراءة.
- **Request-Time Server Verification**: الحسم يقع **قبل** أي عرض — لا نافذة للتزييف، وتعمل بنفس البنية مع أي بوابة تعيد التوجيه عبر `returnUrl`.

### مع `returnUrl`
`createPaymentSession` يمرر `returnUrl = ${origin}/booking/{id}/checkout?step=success` للبوابة. بعد نجاح الدفع يعود الضيف لهذا الرابط فتُحدَّد الحالة على الخادم فوراً. (معرّف الجلسة لا يمكن وضعه في `returnUrl` مسبقاً لأنه غير معروف قبل إنشائها — لذلك يتم الربط عبر `bookingId`، ومعيار `session` اختياري لمطابقة أدق.)

---

## 6️⃣ خصوصية البيانات (Server-First Fetching)

- `page.tsx` تستخدم **`select` لكل علاقة** (لا `include`): folio `{totalCharges,totalPaid,balance,status}`، hotel `{name,nameAr,currency,timezone}`، guest `{name,email,phone}`، rooms `{checkIn,checkOut}`.
- **لا** تمرير لإيرادات الفندق، دفتر الأستاذ، الأسعار الداخلية، بيانات ضيوف/جهات أخرى.
- المبلغ الوحيد المكشوف هو `balance` و `totalAmount` و (في النجاح) `paymentSession.amount`.
- **`balance <= 0` → `notFound()`**: الحجوزات المدفوعة لا تُعرض في مسار الدفع. **الترتيب مهم (M6):** حُسمت بوابة `step === 'success'` **قبل** فحص الرصيد — فالحجز الذي اكتمل سداده (رصيده صفر) يعود من البوابة لرؤية `SuccessView` وليس 404.
- `export const dynamic = 'force-dynamic'` يمنع الترجمة الساكنة عند البناء (استعلام DB + `searchParams`).

**تنبيه معماري اكتُشف أثناء التنفيذ:** حقول `checkIn/checkOut` ليست على `Booking` بل على `BookingRoom` — تُشتق في `page.tsx` عبر `min`/`max` على غرف الحجز.

---

## 7️⃣ الأنواع المشتركة (`context/PaymentSessionContext.tsx` — محلي وليست في `@hotel/shared`)

```ts
export type Gateway = 'plutu' | 'tlync' | 'bank-transfer' | 'cash';
export type CheckoutStep = 'select-gateway' | 'redirecting' | 'bank-transfer'
  | 'cash' | 'success' | 'failed';

export interface PaymentSessionData {
  paymentSessionId: string;
  paymentUrl: string;
  gatewayTransactionId: string;
  amount: number;
  currency: 'LYD';
  expiresAt: string;
}

export interface CheckoutContextValue {
  sessionData: PaymentSessionData | null;
  booking: PublicBookingSummary;    // غير nullable — تُمرَّر من الـ Server دائماً
  hotel: PublicHotelInfo;
  loading: boolean;
  error: string | null;
  setSessionData: (d: PaymentSessionData | null) => void;
  setLoading: (b: boolean) => void;
  setError: (e: string | null) => void;
  refetch: () => Promise<void>;     // حجز للأطوار القادمة
}
```

**قرار:** الأنواع محلية في مسار الـ checkout لأنها خاصة بوجهة الدفع ولا تشارك مع الـ Backend (عقد الـ API موثّق بالـ `route.ts`).

---

## 8️⃣ سيناريوهات الحافة

| السيناريو | المعالجة |
|-----------|----------|
| الوصول إلى `?step=success` يدوياً | الخادم يستعلم ويُظهر الرسالة «تعذر التأكيد» (بلا نجاح زائف) |
| العودة من البوابة قبل اكتمال تطبيق الـ Webhook | `?step=success` → غير موثّق → استطلاع خفيف `.../status` كل 3ث ×5؛ يتأكد → `router.refresh()` مرة واحدة → `SuccessView` automatically، يفشل → زر يدوي |
| الوصول إلى `?step=redirecting` بلا جلسة | `RedirectingView` يكتشف `paymentUrl` فارغاً → شاشة «جلسة غير متوفرة» + عودة |
| فشل إنشاء الجلسة | `goToStep('failed', gateway)` + `error` → `FailedView` بـ `onRetry` يعيد الاستدعاء |
| الحجز مدفوع/بلا رصيد | `balance <= 0` → `notFound()` |
| انتهاء الجلسة (30 دقيقة) | تُعرض رسالة صلاحية في `RedirectingView`؛ إنشاء جلسة جديد عبر `?step=select-gateway` |
| الغرض Reference للبنك | ثابت عبر `useState` initializer (لا يتغير بين الـ renders) |

---

## 9️⃣ حالة الأطوار (Phased Status)

| الطور | الحالة | الملاحظات |
|--------|--------|-----------|
| **M0: Foundation** | ✅ منجز | Context + Types + CheckoutLayout + ProgressSteps + page.tsx |
| **M1: Gateway Selection** | ✅ منجز | GatewaySelector + URL sync + توجيه إلكتروني/تعليمات |
| **M2: Redirect + Security** | ✅ منجز | RedirectingView صريح + **بوابة نجاح Server-Side** + تحديث هذه الوثيقة |
| **M3/M4: Bank/Cash** | ✅ منجز (أساس) | BankTransferView + CashView (QR/مهلة لاحقاً إن طُلب) |
| **M5: Result Views** | ✅ منجز (بدون confetti) | SuccessView (Server-gated) + FailedView |
| **M6: Polish** | ✅ منجز | Auto-revalidation للبوابة + ARIA كامل + إصلاح ترتيب بوابة النجاح قبل تحقق `balance<=0` (حجز مدفوع بالكامل لا يصبح 404) |

---

## 📋 قائمة التحقق (Done — كما نُفذت)

- [x] `select` صريح في كل استعلامات `page.tsx` — لا تسريب بيانات
- [x] لا تبعيات جديدة — shadcn/ui + Tailwind فقط (لا sonner/confetti/QR)
- [x] لا Countdown — توجيه صريح
- [x] `?step=success` مغلقة بالخادم عبر `PaymentSession.status === 'SUCCEEDED'`
- [x] الـ Client لا يعرض نجاحاً أبداً (Defense-in-Depth)
- [x] Auto-revalidation (Hotfix): Lightweight Polling إلى `GET .../payment-session/[sessionId]/status` كل 3ث ×5 (معلم ثقيل-خفيف + Rate Limit) ثم `router.refresh()` **مرة واحدة** عند النجاح فقط — لا RSC Spam
- [x] ARIA: `aria-current="step"` في `ProgressSteps`، `role="status"/"alert"` لنتائج الدفع، `aria-live` للنسخ والمبلغ، تركيز تلقائي على التحول بين الخطوات، `ol/li` دلالي
- [x] `useCallback` + `memo` حيث يلزم
- [x] RTL كامل
- [x] typecheck + lint نظيفان
- [ ] E2E / اختبارات المتصفح (الأخير يعد إطاراً خلفياً: الـ Backend 262 اختباراً)

---

**القرار النهائي:** المعمارية قابلة للتوسع نحو بطاقة مدفوعة مستقبلاً بإضافة بوابة جديدة في `gateway-factory` و`PaymentSession.method` دون تغيير مسار الدفع.