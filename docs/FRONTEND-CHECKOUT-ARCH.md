# مقترح معماري — واجهة الدفع المباشر (Frontend Checkout Flow)

## 🎯 الهدف
بناء واجهة دفع سلسة وآمنة للضيوف على صفحة الحجز المباشر، تدعم:
- Plutu / T-Lync (إعادة توجيه للخارج)
- Card (في المستقبل)
- Bank Transfer / Cash (دفع يدوي عند الوصول)

---

## 1️⃣ استراتيجية إدارة الحالة (State Management)

### القرار: **URL State (Search Params) + React Context محدود + useState محلي**

| الطبقة | الأداة | المسؤولية |
|--------|--------|-----------|
| **Navigation / Step** | `next/navigation` + URL Search Params | الخطوة الحالية (`?step=select-gateway`)، `bookingId`، `gateway` |
| **بيانات الجلسة العالمية** | `React.createContext` (PaymentSessionContext) | `paymentSessionId`، `paymentUrl`، `amount`، `currency`، `expiresAt` |
| **نموذج الدفع (Form)** | `useState` / `React Hook Form` | بيانات البطاقة، الحساب البنكي، إلخ |
| **UI State** | `useState` محلي | `loading`، `error`، `selectedGateway` |

### لماذا هذا الاختيار؟
1. **URL State** = قابلية مشاركة الرابط، عمل Back/Forward في المتصفح، لا فقدان للحالة عند Refresh
2. **React Context** محدود = فقط للبيانات المشتركة بين مكونات متعددة (PaymentSession data) — تجنب Prop Drilling دون Over-engineering
3. **useState / RHF** = للعزل التام للحقول الحساسة (بطاقة، بنك) — لا تلوث للسياق العام
4. **Zero Dependencies** = لا Zustand / Jotai / Redux — يقلل Bundle Size، يعتمد على React primitives

### تنفيذ URL State:
```tsx
// app/(public)/booking/[id]/checkout/page.tsx
// قراءة من URL:
const searchParams = useSearchParams();
const step = searchParams.get('step') || 'select-gateway'; // 'select-gateway' | 'redirecting' | 'success' | 'failed'
const gateway = searchParams.get('gateway'); // 'plutu' | 'tlync' | 'bank-transfer' | 'cash'

// كتابة في URL:
const router = useRouter();
router.push(`/booking/${bookingId}/checkout?step=redirecting&gateway=plutu`);
```

---

## 2️⃣ هندسة المكونات (Component Composition)

### شجرة المكونات:
```
CheckoutPage (Server Component)
├── CheckoutLayout (Client) — Layout ثابت: Header، Progress Steps، Footer
├── CheckoutProvider (Client Context) — يجلب/يحتفظ ببيانات PaymentSession
│   ├── StepWrapper (Client) — يدير العرض الشرطي للخطوة الحالية
│   │   ├── GatewaySelector (Client) — بطاقات اختيار البوابة
│   │   ├── RedirectingView (Client) — شاشة "جاري التوجيه..." مع Countdown
│   │   ├── BankTransferView (Client) — عرض بيانات التحويل البنكي (IBAN، مبلغ، مرجع)
│   │   ├── CashView (Client) — تعليمات الدفع النقدي عند الوصول
│   │   └── ResultView (Client) — نجاح / فشل مع إجراءات
│   └── PaymentSessionFetcher (Client) — استدعاء API مرة واحدة عند التحميل
```

### مبادئ منع Re-renders:
1. **Server Components أولاً**: `CheckoutPage` يجلب `booking` و `hotel` من DB، يمررها كـ Props — لا Client-side fetch للبيانات الثابتة
2. **Context مفصول**: `PaymentSessionContext` يحتوي فقط على بيانات الجلسة (`paymentSessionId`, `paymentUrl`, `amount`, `expiresAt`) — لا يحتوي على `loading` أو `error` أو `step`
3. **Memoization**:
   ```tsx
   const GatewayCard = memo(function GatewayCard({ gateway, onSelect, selected }) { ... });
   const AmountDisplay = memo(function AmountDisplay({ amount, currency }) { ... });
   ```
3. **Event Handlers مستقرة**:
   ```tsx
   const handleGatewaySelect = useCallback((g: Gateway) => {
     router.push(`/booking/${bookingId}/checkout?step=redirecting&gateway=${g}`);
   }, [router, bookingId]);
   ```
4. **Fragments للحشو**: تجنب `div` wrapper غير الضروري — استخدم `<>` للـ layout-only components

---

## 3️⃣ تدفق الخطوات (Checkout Flow Steps)

| الخطوة | URL | الوصف | المكون |
|--------|-----|---------|--------|
| **1. اختيار البوابة** | `?step=select-gateway` | عرض بطاقات: Plutu، T-Lync، Bank Transfer، Cash | `GatewaySelector` |
| **2. التوجيه** | `?step=redirecting&gateway=plutu` | عد تنازلي 10 ثوانٍ → `window.location.href = paymentUrl` | `RedirectingView` |
| **3أ. نجاح (Webhook)** | `?step=success&sessionId=xxx` | صفحة نجاح مع رقم الحجز، تعليمات | `SuccessView` |
| **3ب. فشل / إلغاء** | `?step=failed&reason=cancelled` | خيار إعادة المحاولة / تغيير البوابة | `FailedView` |
| **Bank Transfer** | `?step=bank-transfer` | عرض IBAN، مبلغ، مرجع، QR Code (اختياري) | `BankTransferView` |
| **Cash** | `?step=cash` | تعليمات الدفع عند الوصول، مهلة | `CashView` |

### معالجة Redirect لـ Plutu/T-Lync:
```tsx
function RedirectingView({ paymentUrl, expiresAt, onCancel }) {
  const [secondsLeft, setSecondsLeft] = useState(10);

  useEffect(() => {
    const id = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    const timer = setTimeout(() => window.location.href = paymentUrl, 10000);
    return () => { clearInterval(id); clearTimeout(timer); };
  }, [paymentUrl]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <Spinner className="h-12 w-12 text-[var(--gold)]" />
      <p className="mt-4 text-[var(--text-primary)]">جاري توجيهك لبوابة الدفع الآمنة...</p>
      <p className="text-sm text-[var(--text-muted)]">التوجيه خلال <strong>{secondsLeft}</strong> ثوانٍ</p>
      <Button variant="ghost" onClick={onCancel} className="mt-4">إلغاء</Button>
    </div>
  );
}
```

---

## 4️⃣ مكتبات UI وتفضيلات (UX Libraries)

| الحاجة | الاختيار | السبب |
|--------|----------|-------|
| **Design System** | **الشادن/UI (shadcn/ui) الحالي** | موجود بالفعل، متوافق مع Tailwind، يدعم RTL، قابل للتخصيص عبر CSS Variables |
| **Forms** | **React Hook Form + Zod** | موجود في `@hotel/shared`، validation مشارك مع Backend، أداء أفضل من useState للحقول الكثيرة |
| **Toast/Notifications** | **Sonner** (خفيف، يعتمد على shadcn) | بديل أخف لـ react-hot-toast، يدعم Promise API (`toast.promise`) |
| **Loading Skeletons** | shadcn/ui `Skeleton` | متاح بالفعل، تصميم متسق |
| **Countdown/Timer** | **مخصص (useEffect + setInterval)** | لا حاجة لمكتبة — منطق بسيط، صفر اعتماد |
| **QR Code (Bank Transfer)** | **qrcode.react** (إذا طُلب) | خفيف، SSR-compatible، يولد QR لـ IBAN/Merchant Reference |
| **Confetti/Success Animation** | **canvas-confetti** (Lazy-loaded) | فقط في SuccessView — `dynamic(() => import('canvas-confetti'), { ssr: false })` |

### إضافات مقترحة (Package.json):
```json
{
  "dependencies": {
    "react-hook-form": "^7.51.0",     // موجود في shared
    "@hookform/resolvers": "^3.3.4",  // لـ Zod resolver
    "sonner": "^1.4.0",               // Toast notifications
    "qrcode.react": "^3.1.0",         // QR للبنك (اختياري)
    "canvas-confetti": "^1.9.2"       // احتفال النجاح (Lazy)
  },
  "devDependencies": {
    "@types/canvas-confetti": "^1.6.4"
  }
}
```

---

## 5️⃣ أنواع TypeScript المشتركة

### في `@hotel/shared/src/types/checkout.ts`:
```ts
export type Gateway = 'plutu' | 'tlync' | 'bank-transfer' | 'cash';

export type CheckoutStep =
  | 'select-gateway'
  | 'redirecting'
  | 'bank-transfer'
  | 'cash'
  | 'success'
  | 'failed';

export interface PaymentSessionData {
  paymentSessionId: string;
  paymentUrl: string;
  gatewayTransactionId: string;
  amount: number;
  currency: 'LYD';
  expiresAt: string; // ISO 8601
}

export interface CheckoutContextValue {
  sessionData: PaymentSessionData | null;
  booking: PublicBookingSummary;
  hotel: PublicHotelInfo;
  refetch: () => Promise<void>;
}
```

---

## 6️⃣ الأمان والخصوصية (Security)

1. **لا تخزين أسرار في Frontend**: `secretKey`، `merchantId` لا تصل للمتصفح — فقط `paymentUrl` و `paymentSessionId`
2. **CSP Headers**: في `next.config.js`:
   ```js
   async headers() {
     return [{
       source: '/booking/:path*',
       headers: [
         { key: 'Content-Security-Policy', value: "frame-src 'self' https://*.plutu.ly https://*.tlync.ly;" },
         { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
       ],
     }];
   }
   ```
3. **HTTPS Only**: جميع مسارات `/booking/*` تفرض HTTPS عبر Middleware
4. **No Sensitive Data in URL**: `paymentSessionId` في URL مقبول (UUID)، لكن لا `amount` أو `guestData`

---

## 6️⃣ ملفات ومسارات مقترحة (File Structure)

```
apps/web/src/
├── app/(public)/booking/[id]/checkout/
│   ├── page.tsx                    # Server Component — يجلب Booking + Hotel
│   ├── layout.tsx                  # Layout مع CheckoutProvider
│   ├── components/
│   │   ├── CheckoutLayout.tsx      # Steps indicator, header, footer
│   │   ├── GatewaySelector.tsx     # بطاقات اختيار البوابة
│   │   ├── RedirectingView.tsx     # Countdown + Redirect
│   │   ├── BankTransferView.tsx    # IBAN + Amount + QR + Copy buttons
│   │   ├── CashView.tsx            # تعليمات الدفع النقدي
│   │   ├── SuccessView.tsx         # Confetti + Booking details
│   │   ├── FailedView.tsx          # Retry / Change gateway
│   │   └── ProgressSteps.tsx       # مؤشر الخطوات (1-2-3)
│   └── context/
│       └── PaymentSessionContext.tsx
├── components/ui/                  # shadcn/ui components (موجود)
├── lib/
│   ├── api-client.ts               # apiPost/get مع error handling (موجود)
│   └── validations/
│       └── checkout.ts             # Zod schemas للـ forms
└── hooks/
    └── useCheckout.ts              # منطق مشترك (redirect, poll, cancel)
```

---

## 7️⃣ سيناريوهات الحافة (Edge Cases)

| السيناريو | المعالجة |
|-----------|----------|
| **انتهاء صلاحية الجلسة** (`expiresAt` passed) | إظهار `FailedView` مع زر "إنشاء جلسة جديدة" يستدعي API مجدداً |
| **إغلاق تبويب التوجيه** | عند العودة للصفحة، Polling على حالة `PaymentSession` → إذا `SUCCEEDED` → SuccessView، إذا `PENDING` → RedirectingView |
| **فشل Netzwerk أثناء Redirect** | زر "إعادة المحاولة" يعيد استدعاء `createPaymentSession` |
| **تغيير البوابة بعد التحديد** | زر "تغيير طريقة الدفع" يعيد لـ `step=select-gateway`، يلغي الجلسة القديمة (اختياري: DELETE `/api/public/bookings/[id]/payment-session`) |
| **Mobile Safari / In-App Browser** | تجنب `window.location.href` المباشر — استخدم `window.open(paymentUrl, '_self')` للتوافق |

---

## 8️⃣ خطة التنفيذ المقترحة (Phased)

| الطور | المخرجات |
|--------|----------|
| **M0: Foundation** | `PaymentSessionContext`، `CheckoutLayout`، `ProgressSteps`، Types، Zod schemas |
| **M1: Gateway Selection** | `GatewaySelector` مع بطاقات Plutu/T-Lync/Bank/Cash، URL State sync |
| **M2: Redirect Flow** | `RedirectingView` مع Countdown، `window.location.href`، معالجة الأخطاء |
| **M3: Bank Transfer** | `BankTransferView` مع IBAN، Copy to clipboard، QR Code (اختياري) |
| **M4: Cash View** | `CashView` مع تعليمات، مهلة، رقم مرجع |
| **M5: Result Views** | `SuccessView` (Confetti)، `FailedView` (Retry/Change) |
| **M6: Polish** | Toast notifications، Skeleton loading، Accessibility (ARIA)، E2E tests |

---

## 📋 قائمة التحقق (Definition of Done)

- [ ] جميع المكونات `memo` حيث مناسب
- [ ] لا `useEffect` غير ضروري — اعتماد على URL State
- [ ] `loading` / `error` states لكل تفاعل
- [ ] Accessibility: `aria-label`، `role="button"`، Focus management
- [ ] RTL support كامل (Tailwind `rtl:` variants)
- [ ] Toast notifications للنجاح/الخطأ (Sonner)
- [ ] E2E test: Happy path (Plutu → Success)، Bank Transfer، Cash، Cancel/Back
- [ ] Bundle size impact < 15KB gzipped للـ Checkout chunk

---

**القرار النهائي:** هذا المقترح جاهز للمراجعة. عند الموافقة، نبدأ بـ **M0: Foundation**.