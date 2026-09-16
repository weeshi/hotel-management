# وثيقة معماريّة — اختبار العقود (Contract-Driven Gateway Testing) — M7

> **الحالة:** ✅ **مُنفَّذ (M7.1 As-Built)** — وثيقة حيّة تُحدَّث مع كل تغيير وفق الدستور. تعالج ثغرة كانت اختباراتنا (Unit/Integration) تتحقق من **منطقنا** بعقود **مفترضة**؛ الآن طبقة `tests/contracts` تُشغّل بوابات Plutu/T-Lync على شبكة HTTP حقيقية داخل CI، فتكتشف أي تغيّر في العقد الخارجي فوراً (الحمولات، الرؤوس، التوقيعات، تأخّر webhook) كفشل محدّد لا كخلل غامض في الإنتاج.

---

## 🎯 الهدف

بناء طبقة **Sandbox Contract** تشغّل بوابات **Plutu / T-Lync** على شبكة HTTP حقيقية داخل CI/CD:
- تختبر رحلة الضيف الكاملة من `POST /payment-session` → عودة `returnUrl` → Webhook → تسوية → `SuccessView`، **بلا أي اعتماد على خوادم البوابات الفعلية** (التي قد تكون متوقفة/Downtime).
- تكشف تغيّر العقد الخارجي **في وقت مبكر** كفشل محدد ومفهوم، لا كخلل غامض في الإنتاج.

---

## 🏗️ الهيكل المُنفَّذ (M7.1)

```
apps/web/tests/contracts/
├── dummy-gateway/server.ts        # node:http على منفذ ephemeral — endpoints فعلية للبوابتين
│                                  # POST /payment/create (plutu) — POST /payment/initiate (tlync)
│                                  # GET /pay/:id — تسجيل كل طلب (method/url/headers/body)
│                                  # behavior.failCreate لتوليد رفض من طرف البوابة
│                                  # scheduleDelivery(delayMs) لبوابة تأخير webhook
├── shared/signer.ts               # نسخة مطابقة لخوارزميتي التوقيع (plutu=sha256+suffix | tlync=HMAC)
│                                  # + CONTRACT_SECRETS الثابتة للاختبار + buildSignedWebhook
├── fixtures/
│   ├── plutu/v1/manifest.json     # apiVersion + create/webhook contract + list of fixtures
│   │   └── webhook.{success,failed,pending}.json / create.request.json  (توقيعات ذهبية مضمّنة)
│   └── tlync/v1/…                 # نفس البنية (tran_id بدل transaction_id، غياب توقيع create)
├── schemas/
│   ├── plutu.contract.schema.ts   # zod: create-request/response + إعادة تصدير plutuWebhookSchema
│   └── tlync.contract.schema.ts   # من adapters المصدر (مصدر حقيقة واحد — لا ازدواج)
└── scenarios/gateway-contract.test.ts  # 7 اختبارات: المتجهات + رحلة كاملة + رفض التوقيع
                                       # + رفض الإنشاء + تأخّر webhook
```

**دورة التشغيل (كما بُنيت):**
1. `beforeAll` يشغّل Dummy Gateway على منفذ عشوائي ثم يحقن بيئة الـ adapters (`PLUTU_BASE_URL`/`TLYNC_BASE_URL` + مفاتيح `_DEV` + `PAYMENT_CRYPTO_KEY`) **قبل** الاستيراد الديناميكي للـ routes (محامل الوحدات طازجة لكل ملف test).
2. `POST payment-session` الحقيقي يعبر عبر **adapter الحقيقي** نحو Dummy Gateway عبر fetch (لا mock) — يُلتقط الطلب ويدقق على Schema + إعادة حساب التوقيع + `Content-Type`.
3. تسليم webhook عبر استدعاء route الـ webhook الحقيقي (بنفس مسار `gateway-webhook.test.ts`) لكن **بتوقيع حقيقي** وفحص `DANGER_BYPASS_WEBHOOK_IP_CHECK`.
4. النهاية: تأكيد Status endpoint (`verified`) + التسوية على `Folio` (SETTLED) + **SSR لـ `page.tsx`** ينتج `SuccessView` (تحقق حقيقي على مستوى الصفحة).
5. سيناريو «تأخّر webhook»: عبور بوابة الـ 3 ثوانٍ عبر `vi.useFakeTimers({ toFake: ['setTimeout'] })` بلا نوم حقيقي.

---

## 1️⃣ محاكاة البوابات في CI: **MSW أم Dummy HTTP Server؟** — رأيي

### الخياران
| المحور | **MSW** (Mock Service Worker) | **Dummy HTTP Server** (مدمج عبر `node:http`) |
|---|---|---|
| الحد الذي يُختبر | يغترض الطلبات داخل **العملية** (Node interceptor / Service Worker في المتصفح) — قبل الوصول إلى الشبكة | خادم يرصد على منفذ حقيقي — التطبيق يخترقه عبر fetch، فيُختبر **مسار HTTP بالكامل** |
| واقعية HTTP | مغطس: بلا socket حقيقي، لا TLS، لا رؤوس فعلية | حقيقي 100%: methods/headers/status/redirect/keep-alive |
| حقن الأعطال | استجابات أخطاء يسهل، لكن إغلاق الشبكة/التأخير الحقيقي أضعف | كامل: إغلاق الاتصال، 5xx، timeout، تأخير الـ webhook |
| المكان الذي يخدم | **اختبارات الواجهة/المتصفح** | **Backend-to-Gateway** (يمثل العلاقة الفعلية خارج المتصفح) |
| الوزن/الإعداد | تبعية + تهيئة worker | **صفر تبعيات** (`node:http`) |
| تسجيل الحركة | محدود | كامل (سجل طلبات للفحص) |

### القرار: **Dummy HTTP Server** مدمج في بيئة الاختبار
السبب الجوهري: **الحد الذي نختبره هو بين Adapter الزبون وبوابة خارجية** — خدمة الشبكة الفعلية، لا داخل المتصفح. أي اعتراض داخل العملية (MSW) يخفي تفاصيل الشبكة نفسها التي يمكن أن تتغير (Header HMAC، HTTP-status، Redirect، Keep-Alive)، ويضيف طبقة اعتراض بين التطبيق والخادم لأدنى فائدة عندنا. **MSW ساحته الحقيقية ليست هنا**: سأحتفظ به كأداة لاحقة إذا أردنا محاكاة `fetch` داخل اختبارات مكونات الواجهة (E2E للصفحات M6 مثلاً) — لا كطبقة عقود.

---

## 2️⃣ كيف نضمن ألا تصبح العقود قديمة (Stale)؟

ثلاثة دفاعات متعاضدة:

1. **Golden Files مُثبَّتة بالإصدار + تحقق خامس منعكس على الاتجاهين:**
   كل `fixture` يحمل `apiVersion` (مثل `plutu@2025-02`, `tlync@2024-11`) في ملف Manifest.
   - اتجاه (fixture → zod): تُحقن حمولة الـ fixture في `schemas/*.contract.schema.ts` → فشل الـ parse يكشف تغيّر الشكل فوراً.
   - اتجاه (zod → app): أي تفاعل مع حمولة البوابة في الـ adapters يمر عبر نفس الـ zod → الـ schema **هو** العقد القابل للتنفيذ؛ تغيّر الواقع يكسر إعادة التشغيل بصوت عالٍ.

2. **وضع التسجيل (VCR — Recording/Replay):**
   تشغيل اختياري لمرة واحدة مقابل Sandbox البوابات الفعلية يسجّل الحركة الحقيقية كـ `cassettes` (نصوص) تحفظ داخل `fixtures/` وتُشغَّل كمقتربة أبداً. بذلك تصبح الـ fixtures **وثائق قابلة للتنفيذ** للعقد الحالي وليس مجرد صور تخمين.

3. **Live Contract Smoke Probe (اختياري — غير حاجب للـ PR):**
   Job منفصل (نهاري/عند الطلب) يستهدف Sandbox البوابات **الحقيقية** بعمليات قراءة فقط (تحقق هوية التاجر/سلامة الاتصال) ويقارن الاستجابة مع الـ fixtures، وينشر **تقرير Drift** في الـ PR/issues. **لماذا غير حاجب؟** لأن الهدف من الـ Sandbox أصلاً هو أن لا يُعتمد على توفر البوابات الحقيقية — تحويل الاعتماد إليها يعيد المشكلة التي حللناها.

**قاعدة الحوكمة:** أي إشعار رسمي بتغيير API (from changelogs/portals) → PR مخصص لتحديث الـ fixtures + الـ zod + الـ Manifest؛ يستحيل تجاوز الاختبار الفاشل. هذا يحوّل «التقادم» من «حادثة لا أحد يعلم» إلى «PR معلّق مفهوم».

---

## 3️⃣ الأدوات المفضلة (الأنضف وزناً)

- **`node:http`** — خادم مدمج **صفر تبعيات** يكفي لـ 4-5 روابط قالبية. لا حاجة لـ Fastify/Hono؛ وعند الحاجة للنمو نراجع بعناية (دستور: لا تبعيات بلا اعتماد صريح).
- **`vitest`** القائم — دورات حياة الخادم لكل سيناريو (`beforeAll`/`afterAll`) بمنفذ عشوائي.
- **`zod`** الموجود أصلاً في `@hotel/shared` — عقود قابلة للتنفيذ (انظر §2/1).
- **`undici` MockAgent** (مدمج في Node `fetch`) — يُذكر كبديل تقني فقط؛ نرجمه لأنه يفتقد واقعية التقاطع الشبكي، مثل MSW.
- **MSW** — مؤجل إلى اختبارات الواجهة (ليست ساحة هذه الطبقة).
- **لا `faker`** — الـ fixtures يدوية ذهبية (حتمية وقابلة للمراجعة في PR).

---

## 🔁 التكامل مع سير العمل الحالي

- السيناريوهات تعمل **ضمن نفس vitest** (بدون عمليات موازية — `fileParallelism: false`) وتستمر ضمن الـ suite الكبير (262+ اختباراً)، فيبقى الأمر «تشغيل واحد» في CI.
- قاعدة بيانات الاختبار `hotel_test` فقط — الجلسات/المدفوعات هناك تصويرية؛ **صفر أثر على الأنظمة الحقيقية**.
- يعتمد على البنية المنجزة: `ResetDb` (بعد إصلاح حذف `PaymentSession` في M6) + Webhook `DANGER_BYPASS_WEBHOOK_IP_CHECK` داخل المختبر — فتبقى الحصانة القائمة للأمان سارية.

---

## ✅ قرارات CTO المعتمدة (M7.1)

1. **YAGNI:** Dummy Gateway يُكدَّس داخل `apps/web/tests/contracts/` — لا حزمة مستقلة حتى ظهور مستهلك ثانٍ.
2. **زمن CI:** تأخير webhook يُحاكى عبر `vi.useFakeTimers()` بدل النوم الحقيقي — مُحسَّن التطبيق (أدناه).
3. **Live Contract Smoke Probe → مؤجّل إلى M7.2** (غير حاجب للـ PR).

## 🛠️ تحسينات طرأت أثناء التنفيذ (وثّقت كجزء من الكود)

- **`vi.useFakeTimers` مُضيَّق:** لا نصنع `toFake` عريض ولا ننفّذ عمليات `prisma` داخل `advanceTimersByTimeAsync`. التوقيت المزوّر يختبر **عبور بوابة التأخير فقط** (الخطاف يشتغل) ثم يُعاد العمل بالتوقيت الحقيقي قبل تسليم الـ webhook — يمنع deadlocks/flakes البيئة المختلطة التي ظهرت فعلياً أثناء التطوير.
- **Override بيئة Base URL:** أُضيف `PLUTU_BASE_URL`/`TLYNC_BASE_URL` (و `_DEV`) إلى `getPlutuConfig`/`getTLyncConfig` — كان `baseUrl` سابقاً صيغة hardcoded فقط، فلا يمكن لأي اختبار وصلي أن يوجّه الـ adapter الحقيقي لخادم محلي. مفيدة أيضاً لاستبدال sandbox عبر البيئة في النشر.
- **مصدر حقيقة واحد للـ webhook schemas:** `schemas/*.contract.schema.ts` تعيد تصدير `plutuWebhookSchema`/`tlyncWebhookSchema` من الـ adapters نفسها — لا نسخة مكررة في الاختبار حتى لا تزدوج وتتباعد.
- **`vitest.config.ts`:** أُعلّق oxc (`oxc: false`) مع `esbuild: { jsx: 'automatic' }` حتى نستطيع استيراد صفحات `.tsx` (فحص SuccessView على مستوى الصفحة). لا أثر على باقي الـ suite.
- **7 اختبارات Contract جديدة** فوق الـ 266 الحالية، صفر تبعيات جديدة، تعمل بلا Redis (rate-limiter يُقلَّد).

## ⏳ مؤجل إلى M7.2

- **Live Contract Smoke Probe:** job دوري غير حاجب تجاه Sandbox البوابات الفعلية (قراءة فحسب) ينتج تقرير Drift مقابل الـ fixtures.
- تسجيل VCR اختياري (record/replay) ضد sandbox الحقيقي لجعل الـ fixtures وثائق حيّة فعلياً.

## قواعد الحوكمة (سارية)

- أي إشعار رسمي بتغيير API → PR مخصص يحدّث الـ fixtures + الـ zod + `manifest.json`؛ يستحيل تجاوز اختبار فاشل.
- Golden fixtures توقيعية: التوقيع المضمّن يجب أن يطابق إعادة الحساب في كل شوط (كشف تلاعب أو انحراف في الخوارزمية).
- كل تغيير لاحق في هذه الطبقة يُوثَّق في هذا الملف فوراً.