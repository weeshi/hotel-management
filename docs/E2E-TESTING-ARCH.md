# وثيقة معماريّة — اختبارات E2E عبر Playwright (E2E Testing Architecture) — M7.2

> **الحالة:** 🟢 **E2E.1 (البنية التحتية) و E2E.1.5 (مصادقة Super-Admin 2FA) مُنفَّذان ومُتحقَّق منهما.** المسرح جاهز: خادم Dummy مستقل + خط تحكّم + تهيئة `hotel_e2e` + `playwright.config.ts`، مع اختبار دخاني (Smoke) ناجح يستدير على `/api/health` و`/__health`. E2E.1.5 يضيف اختبارات الواجهة للمصادقة الثنائية عبر **Prisma Injection + Dual Time Sync** (إجمالي 9/9 — انظر §13). اختبارات رحلة الدفع تُبنى في **E2E.2** (لم تبدأ بعد).
>
> هذا المستند هو **مصدر الحقيقة** لمسار E2E؛ أي انحراف أثناء التنفيذ يُعدّل هنا فوراً. قسم «ما تم بناؤه فعلياً» أدناه يسرد الملفات والالتزامات.
>
> **القرار المُتبنّى (100%):** Playwright هو محرّك E2E الرسمي — لأن جوهر رحلة الدفع هو تنقّل **عبر أصلين (cross-origin)** بين تطبيقنا وبوابة الدفع، وهو بالضبط ما يتقنه Playwright (متعدد الأصول/الصفحات/السياقات) ويعاني فيه نموذج Cypress القائم داخل المتصفح.

---

## 1) 🎯 الهدف وغير الهدف

**الهدف:** اختبار رحلة الدفع **كامتصفح حقيقي** من طرف إلى طرف:
`صفحة الحجز/الدفع → إعادة توجيه لبوابة الدفع (Dummy) → عودة الضيف (returnUrl) → تسليم webhook حقيقي → تسوية الفاتورة → ظهور حالة النجاح للمستخدم`.

**غير الأهداف (تدرسها طبقات أخرى):**
- صحة حمولات/توقيعات البوابة → **اختبارات العقود** (`docs/CONTRACT-TESTING-ARCH.md`).
- منطق الأعمال للفاتورة/المدفوعات معزولاً → **اختبارات التكامل** (Vitest).
- فحص SSR/النصوص ≠ هدف E2E الأدق: نصوص الواجهة تُختبر هنا (المستوى الذي يملكها)، لا في العقود.

**المبدأ الحاكم:** E2E **صندوق أسود** — لا يستورد وحدات `src/`، بل يخاطب النظام عبر HTTP/المتصفح فقط (باستثناء أدوات البذر المباشرة على قاعدة البيانات، انظر §6).

---

## 2) 🏗️ المعمارية العامة

```
                         ┌─────────────────────────────────────────────┐
                         │            Playwright Test Runner            │
                         │  fixtures · assertions · trace/video         │
                         └───────┬───────────────────────┬──────────────┘
                                 │ (1) يقود المتصفح        │ (3) خط التحكم HTTP
                                 ▼                        ▼
                 ┌───────────────────────────┐   ┌───────────────────────────┐
                 │      Browser (Chromium)   │   │   Dummy Gateway (4400)    │
                 │  يزور التطبيق و Gateway    │   │  /pay/:id · /__control/*  │
                 └──────┬─────────────┬──────┘   └─────────────┬─────────────┘
                        │             │                        │
              (2) تنقّل │             │ (2) تنقّل عبر الأصلين  │ (4) webhook موقّع
                        ▼             ▼                        │   إلى callback_url
                 ┌─────────────────────────────┐               │
                 │   Next.js app (3100)        │◄──────────────┘
                 │   webServer #1 · hotel_e2e  │
                 │   routes + adapters حقيقية  │
                 └─────────────────────────────┘
```

**الخادمان اثنان (Playwright `webServer` مصفوفة):**
1. **Dummy Gateway** — عملية HTTP مستقلة بمنفذ ثابت معروف (لأن المتصفح سيزورها فعلاً، بعكس اختبارات العقود ذات المنفذ العشوائي داخل العملية).
2. **Next.js app** — عملية التطبيق الحقيقية (`next start` على بناء مسبق)، تشير قواعدها إلى `hotel_e2e` وترجع بواباتها إلى Dummy عبر البيئة.

**نقطة التلاقي بين الخادمين** ليست معرفة مسبقة، بل **ما يُرسله التطبيق في طلب الإنشاء نفسه**: `callback_url` (وجهة الـ webhook) و`return_url` (وجهة عودة المتصفح). Dummy يخزنهما مع الطلب ويعيد استخدامهما — صفر اقتران ثابت.

---

## 3) 🧩 المكوّنات

### 3.1 خادم Dummy Gateway — **واحد بوضعَي تشغيل**

نُطوّر `apps/web/tests/contracts/dummy-gateway/server.ts` الحالي إلى وحدة قابلة للاستضافة بوضعين (Single Source):
- **in-process** — كما هو الآن داخل Vitest (منفذ ephemeral، صفر تبعيات).
- **standalone** — ملف تشغيل `apps/web/scripts/e2e-dummy-gateway.ts` يُقلع العملية على منفذ ثابت.

لا نكتب خادماً ثانياً؛ نفس المسارات ونفس الـ`signer` ونفس الـ`fixtures`.

**مسارات البوابة (منتج):**

| Method | Path | الوظيفة |
|---|---|---|
| `POST` | `/payment/create` | تقليد Plutu — يعيد `payment_url` (= `/pay/:sessionId`) + `session_id` + `transaction_id`، ويحفظ الطلب بمفتاح الجلسة |
| `POST` | `/payment/initiate` | تقليد T-Lync — نفس الفكرة، `tran_id` |
| `GET` | `/pay/:sessionId` | **صفحة HTML بسيطة** (انظر 3.2) |
| `GET` | `/__health` | جاهزية للـ`webServer` |

### 3.2 صفحة الدفع المزيّفة `GET /pay/:sessionId`

HTML أدنى (بلا إطار عمل) يحمل:
- ملخّصاً للطلب (المبلغ/العملة/الرقم) من الطلب المخزَّن.
- زرّين: **«إتمام الدفع»** و**«فشل الدفع»** (وسم `data-testid` مثل `dg-succeed` / `dg-fail`).
- زرّ ثالث اختياري: **«العودة بدون دفع»** (لاختبار عودة الضيف قبل وصول الـ webhook).

**سلوك الزر عند الضغط (Server-side):**
1. يبني Dummy حمولة الـ webhook من الطلب المخزَّن (بما فيها `order_id`، `amount`) وفق شكل البوابة، ويوقّعها بنفس خوارزمية `tests/contracts/shared/signer.ts`.
2. يرسل الطلب (`POST`) إلى **`callback_url` المخزَّن** (أي route الـ webhook في تطبيقنا)، مع ترويسة `X-Forwarded-For: 127.0.0.1` كي يمرّ عبر **قائمة IP الحقيقية** لا عبر تجاوز الطوارئ (انظر §7).
3. يعيد `302` إلى **`return_url` المخزَّن** → يعود المتصفح لتطبيقنا، وتبدأ حلقة التحقق/التحديث القائمة (M6).

بهذا يختبر E2E **نفس مسار الإنتاج**: إعادة توجيه عبر الأصلين، ثم webhook حقيقي، ثم تأكيد الحالة في الواجهة.

### 3.3 خطّ التحكم `POST /__control/*` (للسائق، خارج المتصفح)

حالات الحواف والأخطاء لا تُدار عبر الواجهة بل عبر نقطة تحكم مخفية يستدعيها Playwright `request`:

| Endpoint | الغرض |
|---|---|
| `GET /__health` | جاهزية الخادم |
| `GET /__control/creates` | فحص الطلبات المستلمة (تحقق schema/توقيع فعلي) |
| `POST /__control/settle` | `{ sessionId, status, fixture? }` — إرسال webhook الحالة الآن |
| `POST /__control/delay` | `{ sessionId, delayMs }` — جدولة webhook متأخّر (لاختبار «الضيف عاد قبل التسوية») |
| `POST /__control/forge` | `{ sessionId }` — إرسال توقيع مُحرَّف (توقع 401 بلا أثر مالي) |
| `POST /__control/duplicate` | `{ sessionId }` — إرسال نفس الـ webhook مرتين (Idempotency) |
| `POST /__control/fail-create` | `{ provider, status, body }` — جعل الإنشاء يفشل من طرف البوابة |
| `POST /__control/reset` | تصفير حالة Dummy بين الاختبارات |

- الحمولات تُبنى **بمرجع لملفات ذهبية** (`fixture: "plutu/v1/webhook.success"`) فلا تُكرَّر بيانات الاختبار، وتبقى العقود و E2E متطابقين.
- خطّ التحكم لا يخدم الإنتاج إطلاقاً (بوابة أمان §7).

---

## 4) 🔄 دورة الحياة عبر Playwright `webServer`

```ts
// playwright.config.ts — رسم توضيحي (ليس الملف النهائي)
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'on-first-retry', video: 'retain-on-failure' },
  globalTeardown: './tests/e2e/global-teardown.ts',
  webServer: [
    {
      command: 'npm run e2e:dummy-gateway',
      url: 'http://127.0.0.1:4400/__health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { E2E_DUMMY_PORT: '4400' },
    },
    {
      command: 'npm run e2e:prepare-db && npm run build && npm run start',
      url: 'http://127.0.0.1:3100/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/hotel_e2e',
        PLUTU_BASE_URL: 'http://127.0.0.1:4400',
        TLYNC_BASE_URL: 'http://127.0.0.1:4400',
        PLUTU_MERCHANT_ID: 'mer_test_plutu_0001',
        PLUTU_SECRET_KEY: 'sec_key_test_plutu_9e3f',
        PLUTU_CALLBACK_URL: 'http://127.0.0.1:3100/api/external/gateways/plutu/webhook',
        PLUTU_WEBHOOK_IPS: '127.0.0.1',
        TLYNC_MERCHANT_ID: 'mer_test_tlync_0002',
        TLYNC_SECRET_KEY: 'sec_key_test_tlync_7a2b',
        TLYNC_CALLBACK_URL: 'http://127.0.0.1:3100/api/external/gateways/tlync/webhook',
        TLYNC_WEBHOOK_IPS: '127.0.0.1',
        PAYMENT_CRYPTO_KEY: '<64-hex-test-key>',
      },
    },
  ],
});
```

**القواعد المُعتمدة في الدورة:**
1. **المنافذ ثابتة عبر البيئة** (`3100` للتطبيق، `4400` للـ Dummy) — عكس اختبارات العقود العشوائية — لأن الـ`baseURL` والمتصفح يجب أن يعرفا الوجهة مسبقاً.
2. **الجاهزية عبر `url`** (`/__health` و`/api/health`) — يستحيل أن تبدأ الاختبارات قبل جهوز الخادمين.
3. **`reuseExistingServer: !CI`** — إعادة استخدام سريعة محلياً، وإقلاع نظيف في CI.
4. **الإعداد يُحقن عند حدود العملية** (`webServer.env`) — لا تعديل `process.env` بعد التحميل (منهجية M7.1).
5. **تحضير قاعدة البيانات داخل أمر الـ webServer** (`e2e:prepare-db && npm run build && npm run start`) — **اكتُشف تجريبياً أن Playwright يُقلع `webServer` قبل تشغيل `globalSetup`**، لذا لا يجوز أن يعتمد البناء على أن `globalSetup` جهّز القاعدة. الفصل: `e2e:prepare-db` يضمن **وجود المخطط قبل البناء**، و`global.setup.ts` يضمن **بداية نظيفة (TRUNCATE) قبل الاختبارات**.
6. **`ensureDatabase` إنشائي لا هدّام:** يُنشئ `hotel_e2e` إن كانت مفقودة فقط (`E2E_FRESH_DB=1` يفرض DROP/CREATE صراحةً). لا `DROP DATABASE` افتراضي، لأن التطبيق قد يملك pool اتصالات مفتوحاً وقت تشغيل `globalSetup` فيُلحقه الضرر.
7. **`next start` على بناء مسبق** (لا `next dev`) — أداء وثبات أعلى؛ البناء خطوة CI منفصلة أو ضمن الأمر.
8. **الإغلاق** — Playwright ينهي العمليتين تلقائياً؛ `globalTeardown` ينظّف ما تحتاج قاعدة البيانات/الملفات المتبقية.
9. **آثار الفشل** — `trace on-first-retry` + `video retain-on-failure` تُرفع في CI.

---

## 5) 🗄️ طبقة البيانات — قرار المعمارية

### السؤال 1: نفس `hotel_test` أم قاعدة `hotel_e2e` مستقلة؟ — **قاعدة مستقلة، بلا تردد.**

| المعيار | `hotel_test` (Vitest) | `hotel_e2e` (Playwright) — المُوصى به |
|---|---|---|
| نمط إعادة الضبط | `TRUNCATE` شامل **قبل كل اختبار** | تصفير **مرة واحدة قبل التشغيل** + تنقية بنطاق التشغيل |
| عمر الحالة | قصير (اختبار واحد) | **طويل** (رحلة متعددة الطلبات/إعادة توجيه/انتظار webhook) |
| التوازي | معطّل (`fileParallelism:false`) | يعمل (عزل المستأجرين) |

**الأسباب الجذرية:**
1. **تنازع الحذف (Race Conditions):** E2E رحلة تمتد ثوانٍ وترفض أي `TRUNCATE` عابر خلالها. تشغيل الطبقتيْن على قاعدة واحدة = تدمير حالة E2E في منتصف الرحلة. الحل البديل (قفل عام بين المشغّلين) هشّ وبطيء ومرفوض.
2. **اختلاف دورة الحياة:** Vitest يحذف كل شيء قبل كل اختبار؛ E2E يجب أن يبذر مرة ويحافظ على الاستمرارية.
3. **توازي CI:** بفصلهما نستطيع تشغيل مساري الاختبار **بالتزامن** (Vitest على `hotel_test`، Playwright على `hotel_e2e`) → خط أنابيب أسرع بلا تسلسل.
4. **الكلفة صفرية عملياً:** نفس خادم PostgreSQL، اسم قاعدة مختلف؛ لا بنية تحتية جديدة.
5. **اتساق المنهجية:** الحقن عند حدود العملية (`webServer.env.DATABASE_URL`) — نفس فلسفة M7.1.

### السؤال 2: كيفية البذر بأسرع طريقة؟ — **استراتيجية ثلاثية الطبقات**

**الطبقة أ — الأساس الثابت (مرة واحدة قبل التشغيل، `scripts/e2e-prepare-db.ts`):**
- إنشاء `hotel_e2e` إن لم توجد + `prisma db push` (أو `migrate deploy` لاحقاً).
- بذر ما **لا تُنشئه واجهة عامة**: فندق أساس بغرفه/أنواع غرفه/سياسة إلغائه + مستخدم إداري للوحات التحكم.
- **تحسين اختياري محلي:** حفظ اللقطة كقاعدة قالب (`hotel_e2e_template`) فيصبح التصفير الكامل `DROP/CREATE DATABASE … TEMPLATE …` في أقل من ثانية (Postgres ينسخ على مستوى الملفات). يُستخدم في `globalSetup` قبل إقلاع الخادم.

**الطبقة ب — عزل لكل اختبار (عند الحاجة للتوازي):**
- لا نصفر القاعدة أثناء التشغيل. بدلاً من ذلك: **فندق فريد لكل اختبار** بمعرّف تشغيل (`e2e-<runId>-<testId>`) مع `customDomain` فريد (التطبيق متعدد المستأجرين).
- كل اختبار يعمل داخل جزيرته؛ لا تصادم حتى مع `fullyParallel`.
- التنظيف في `globalTeardown` يحذف فقط فنادق `runId` (Cascade) — أرخص وأأمن من `TRUNCATE` كامل.

**الطبقة ج — الحجز (بيانات الرحلة نفسها):**
- **الافتراضي للاختبار المالي:** لا بذر مباشر — الرحلة تبدأ من **واجهة الحجز العامة الحقيقية** حتى صفحة الدفع، فالحجز والـ Folio يُنشآن بمسار الإنتاج. أبطأ بثوانٍ لكنه يختبر ما نريد اختباره فعلاً.
- **الاستثناء (سرعة):** عندما يكون الحجز مجرد شرط مسبق لا موضوع الاختبار، يُبذر عبر طبقة الخدمة الحقيقية (`BookingService.create`) ببرنامج بذر قصير يعمل بنفس `DATABASE_URL` — يبقى المنطق منتِجاً (ترقيم الحجز، إنشاء الـ Folio) بلا واجهة.

**محاذير:**
- لا نضيف مسار `/__seed` داخل تطبيق الإنتاج — البذر يبقى خارج التطبيق (Prisma/Service من عملية الاختبار أو سكربت).
- أي بذر مباشر على الجداول يجب أن يمرّ بنفس دوال `tests/helpers` (مصدر واحد)؛ عند بروز تكرار حقيقي نستخرج حزمة `packages/test-factory` (YAGNI الآن).

---

## 6) 🧪 السيناريوهات المستهدفة (M7.2)

1. **رحلة نجاح Plutu:** حجز ← دفع ← `/pay/:id` ← «إتمام» ← عودة ← عرض النجاح + فاتورة `SETTLED`.
2. **رحلة نجاح T-Lync** (نفس المسار، بوابة مختلفة).
3. **فشل الدفع:** زر «فشل» ← عودة ← حالة فشل واضحة، والرصيد ما زال مستحقاً.
4. **عودة الضيف قبل الـ webhook:** «العودة بدون دفع» ← شاشة انتظار/تحقق، ثم `__control/settle` ← النجاح (يعبر حلقة M6 فعلياً).
5. **توقيع مزوّر:** `__control/forge` ← لا تسوية، لا أثر مالي.
6. **ازدواج الـ webhook:** `__control/duplicate` ← تسوية واحدة فقط.
7. **إنشاء مرفوض:** `__control/fail-create` ← رسالة خطأ مفهومة، لا جلسة معلّقة.
8. **صحّة النصوص المرئية** (المستوى الذي يملك العربية): يتحقق E2E من نصوص النجاح/الفشل والتعليمات — لأن تغيير النص شأن واجهة، لا شأن عقد.

---

## 7) 🔒 الأمان والحراسة

- **Dummy وخط التحكم لا يُشحنان للإنتاج:** يُقلعان فقط من سكربتات الاختبار؛ لا مسار يفعّلهما داخل التطبيق.
- **قوائم IP الحقيقية أفضل من تجاوز الطوارئ:** نضبط `PLUTU_WEBHOOK_IPS=127.0.0.1` ويرسل Dummy ترويسة `X-Forwarded-For` صحيحة → يمرّ الاختبار عبر **نفس بوابة الأمان**، ويبقى `DANGER_BYPASS_WEBHOOK_IP_CHECK` محصوراً باختبارات Vitest.
- **أسرار اختبارية فقط:** مفاتيح ثابتة (`sec_key_test_*`) ومفتاح تشفير اختباري؛ لا أسرار حقيقية في المستودع.
- **ربط على `127.0.0.1` فقط** للخادمين.
- **قاعدة E2E منفصلة** فلا خطر على بيانات التطوير/الإنتاج.

---

## 8) 🔬 المصادر المشتركة مع طبقة العقود

| المكوّن | المصدر الواحد | الملاحظة |
|---|---|---|
| خوارزميات التوقيع | `tests/contracts/shared/signer.ts` | لا نسخة ثانية في E2E |
| الملفات الذهبية | `tests/contracts/fixtures/**` (مخرجات المولّد) | خطّ التحكم يشير إليها بالاسم |
| خادم البوابة | `tests/contracts/dummy-gateway/server.ts` | يُرقّى ليعمل مستقلّاً |
| توليد الملفات | `npm run generate:contract-fixtures` (+`:check`) | انظر `docs/CONTRACT-TESTING-ARCH.md` |

**نتيجة:** تغيير عقد البوابة يُحدَّث في **مكان واحد** فينعكس على Vitest و E2E معاً.

---

## 9) ✅ القرارات الأربعة (اعتمدتها الإدارة التقنية)

| القرار | الاعتماد | التنفيذ |
|---|---|---|
| بناء التطبيق | داخل أمر `webServer` (`npm run build && npm run start`) — نسخة مطابقة للإنتاج | ✅ منفّذ |
| التوازي | `workers: 1` الآن، و`fullyParallel` لاحقاً بعد استقرار CI | ✅ منفّذ |
| قاعدة القالب | **YAGNI** — `TRUNCATE` فقط حالياً | ✅ منفّذ (TRUNCATE ديناميكي) |
| المتصفحات | Chromium فقط للمرحلة الحالية (MVP) | ✅ منفّذ |

---

## 10) 🧱 ما تم بناؤه فعلياً (E2E.1)

| المكوّن | الملف | الحالة |
|---|---|---|
| خادم Dummy بوضعَي تشغيل + صفحة الدفع + خط التحكم | `apps/web/tests/contracts/dummy-gateway/server.ts` | ✅ مُرقّى (وضع in-process كما هو + وضع مستقل) |
| مشغّل الخادم المستقل | `apps/web/scripts/e2e-dummy-gateway.ts` | ✅ |
| تحضير القاعدة قبل البناء | `apps/web/scripts/e2e-prepare-db.ts` | ✅ |
| ثوابت البيئة (منفذ/قاعدة/أسرار) | `apps/web/tests/e2e/setup/env.ts` | ✅ |
| أدوات القاعدة (إنشاء + push + TRUNCATE ديناميكي) | `apps/web/tests/e2e/setup/db.ts` | ✅ |
| دورة الحياة (setup / teardown) | `apps/web/tests/e2e/setup/global.setup.ts` + `global.teardown.ts` | ✅ |
| إعداد Playwright | `apps/web/playwright.config.ts` | ✅ |
| اختبار دخاني للبنية | `apps/web/tests/e2e/infrastructure.spec.ts` | ✅ 4/4 |
| فحص جاهزية التطبيق | `apps/web/src/app/api/health/route.ts` | ✅ |

**التحقق:** `npx playwright test` → **4/4 ناجح** (Playwright يُقلع الخادمين ويؤكد الجاهزية تلقائياً)، `tsc --noEmit` نظيف، `next lint` بلا أخطاء، واختبارات عقود Vitest **8/8** (لم يتأثر مسارها بإعادة هيكلة الخادم).

**فراغ متبقٍ:** الفتحة الكاملة لرحلة الدفع (نجاح/فشل/توقيع مزوّر/ازدواج/تأخير) → **E2E.2**. ويُشار إلى أن `checkRateLimit` يعتمد على Redis؛ بيئة E2E لا تشغّله حالياً (يرجى تحديد السياسة في E2E.2).

---

## 11) 📖 Runbook (الصيانة لاحقاً)

| المهمة | الأمر / المكان |
|---|---|
| تشغيل E2E | `npm run test:e2e` (أو `npx playwright test` من `apps/web`) |
| واجهة Playwright التفاعلية | `npm run test:e2e:ui` |
| خادم البوابة المزيّف (مستقل) | `npm run e2e:dummy-gateway` (المنفذ عبر `E2E_DUMMY_PORT`) |
| تحضير قاعدة E2E يدوياً | `npm run e2e:prepare-db` |
| إعادة إنشاء القاعدة من الصفر | `E2E_FRESH_DB=1 npm run e2e:prepare-db` |
| إعداد Playwright | `apps/web/playwright.config.ts` |
| ثوابت البيئة (منفذ/قاعدة/أسرار) | `apps/web/tests/e2e/setup/env.ts` |
| تحديث عقود البوابة | عبر مولّد fixtures فقط (راجع وثيقة العقود) |
| قاعدة E2E | `hotel_e2e` (مستقلة عن `hotel_test`) |
| الأسرار | اختبارية فقط (`sec_key_test_*`) |

---

## 12) 🔁 التكامل مع الحالة الراهنة

- يبني فوق المنجز: `dummy-gateway/server.ts` + `shared/signer.ts` + الملفات الذهبية + مولّدها.
- لا يمسّ مسار Vitest ولا `hotel_test` ولا إعداد `vitest.config.ts`.
- يحافظ على قواعد الحوكمة: العقود → API فقط، الواجهة → E2E، والمستندات تُحدَّث مع الكود.

---

## 13) 🔐 E2E.1.5 — رحلة مصادقة Super-Admin الثنائية (2FA UI)

> **الحالة:** 🟢 مُنفَّذ ومُتحقَّق منه — **9/9** شاملة (بنية §10: 4/4 + مصادقة: 5/5). التزام: `apps/web/tests/e2e/superadmin-auth.spec.ts` (+ `tsc --noEmit` نظيف + `next lint` بلا أخطاء).

### 13.1 قرار الأمن (InfoSec) — لماذا لا `routes /api/test/*`

- **مرفوض تماماً (Zero-Trust):** مسارات `routes /api/test/*` داخل تطبيق الإنتاج — حتى لو مقيّدة بـ `NODE_ENV` — تُعدّ «ثغرة نائمة» (Sleeping Vulnerability): قد تُعيد التشغيل أو تُستغل كـ Backdoor. لامرأوية فيه.
- **المُعتمد (Option C — Prisma Injection):** Playwright يعمل في عملية Node → يملك مقبض `PrismaClient` مباشراً على `hotel_e2e` (كنفس أدوات البذر §5/§6) فيحقن **الحالة** المطلوبة في الجداول. المتصفح بعدها **يُمارس الواجهة والـ API والمتجرّد الحقيقي** فقط — صفر تعديلات على كود الإنتاج، صفر مسارات اختبار.

### 13.2 أساسيات العزل

- **بلا `storageState`:** كل اختبار يبدأ بسياق/ملف كوكيز نظيفين (عزل تام للحالة).
- `test.beforeEach`: حذف صفوف `OtpChallenge` + `RefreshToken`، ثم `upsert` حساب الاختبار `super@hotel.com` / `superadmin123` (كلمة مرور bcrypt مشفَّرة) مع `twoFactorEnabled: true`.
- **خانات OTP = ضغطات مفاتيح حقيقية:** `focus()` على `otp-input-0` ثم `page.keyboard.type(CODE, { delay: 60 })`. **ممنوع `page.fill`** — لأن `useOtpInput.setValueAt` يقطّع الإدخال إلى خانة واحدة ويدفع التركيز للخانة التالية (أي تعبئة جماعية تكسر الحوار).

### 13.3 Prisma Injection (تحقّق الرمز المعروف)

بعد أن يصل تسجيل الدخول إلى شاشة OTP، يقرأ Playwright صفّ التحدي **الحيّ** ثم:
1. يحسب `EXPECTED_HASH = hashOtpCode(userId, 'SUPER_ADMIN_LOGIN', '123456')` — استيراد مباشر من `src/lib/utils/otp` (لا barrel — تجنّب جرّ اعتماديات Next/React).
2. `update` على الصف: `codeHash = EXPECTED_HASH`، `attempts = 0`، `consumedAt = null`.
3. المتصفح يدخل `123456` → التحدي يُستهلك عبر مسار الإنتاج الفعلي.
- **اتساق السر:** `.env` خالٍ من `SUPERADMIN_OTP_SECRET` → الخادم و Playwright يتطابقان على `DEV_OTP_SECRET`. المشهد يقرأ `process.cwd()/.env` عبر `loadDotEnv()` (نفس أداة الـ harness) كي تبقى أسرار CI متوافقة.

### 13.4 المزامنة المزدوجة للزمن (Dual Time Sync) — اختبار التهدئة

تهدئة إعادة الإرسال (`SUPERADMIN_OTP_RESEND_COOLDOWN_SECONDS`) مُنفَّذة في **طبقتين**:
- **الخادم (authoritative):** `OtpChallenge.lastCodeSentAt` في DB → `429 + Retry-After`.
- **العميل:** مؤقّت React (نبضة 1 ثانية) يعطّل زر «إعادة الإرسال» حتى انقضاء المهلة.

لا يكفي تزوير طبقةٍ واحدة (تزوير `clock` يحرّر الزر لكن الـ API يرد 429؛ حقن DB فقط يحرّر الـ API لكن الزر يبقى معطّلاً). الحل **كليهما معاً**:
1. **نصف الخادم — حقن DB:** `lastCodeSentAt = Date.now() - (cooldown + 1) * 1000`.
2. **نصف العميل — ساعة المتصفح:** `page.clock.install()` + `resume()` **قبل** `goto` (تُسجَّل ساعة المتصفح كساعة وهمية مع بقاء التنقّل طبيعياً)، ثم بعد رسم الشاشة: `page.clock.pauseAt(Date.now() + (cooldown + 1) * 1000 + 2000)` — يطلق مؤقّتات React المستحقة (مرة واحدة وفق توثيق Playwright) فيصبح الزر «متاحاً فعلاً».
3. النقر → نجاح، مع ترقّب DB: دوران `codeHash`، `attempts === 0`، تمديد `expiresAt` (التحقّق الاستقصائي عبر `expect.poll`).

### 13.5 فلسفة Retries (اعتماد الإدارة)

- `retries: process.env.CI ? 1 : 0` — Retry واحد يمتص ضجيج CI الخارجي فقط؛ **محلياً صفر Retries**.
- أي اختبار متفلّت يُصلَح ويُشخَّص، ولا يُقنَّع بمزيد من الإعادة — فهي إخفاء لا علاج. `trace on-first-retry` + `video retain-on-failure` تُرفَع في CI.

### 13.6 السيناريوهات الخمسة

| # | السيناريو | أبرز الفحوص |
|---|---|---|
| 1 | حاجز الـ Middleware | `/superadmin/hotels` بلا جلسة → إعادة توجيه على `/superadmin/login` |
| 2 | رحلة 2FA كاملة | login → شاشة OTP → `123456`→ لوحة التحكم + كوكيات `accessToken`/`refreshToken`، و`sa_otp` أُزيلت، و`OtpChallenge.consumedAt` |
| 3 | كود خاطئ | البقاء على `/superadmin/otp`، نص «رمز التحقق غير صحيح»، و`attempts === 1` في DB |
| 4 | إعادة الإرسال والتهدئة | Dual Time Sync §13.4 → كود جديد، `attempts 0`، `expiresAt` ممدَّد، بلا رسالة خطأ |
| 5 | تسجيل الخروج | الكوكيات (access/refresh/sa_otp) منزوعة، وزيارة `/superadmin` تُعيد للدخول |

### 13.7 وسوم الاختبار (data-testid)

| الوسم | الموقع |
|---|---|
| `superadmin-login-email` / `-password` / `-submit` | `(auth)/login/login-form.tsx` |
| `otp-input-0..5` / `otp-resend-btn` / `otp-error` | `(auth)/otp/otp-form.tsx` |
| `superadmin-logout-btn` | `(dashboard)/components/sign-out-button` |
| `superadmin-welcome` | `(dashboard)/dashboard/page.tsx` |

> **ملاحظة العزل التام لكيانات متعددة:** الـ dashboard يرسم **ثلاثة** أزرار خروج (Sidebar + رأس الجوال + بطاقة الترحيب) → الاستهداف مُقيَّد بسياق `getByRole('main')` إرضاءً للوضع الصارم (strict mode).

### 13.8 الملفات

| المكوّن | الملف |
|---|---|
| المشهد الرئيسي (5 اختبارات) | `apps/web/tests/e2e/superadmin-auth.spec.ts` |
| أدوات الخطوة (inherit infra) | `apps/web/tests/e2e/setup/{env,db}.ts` |
| وسوم منتِجة (4 ملفات) | `login-form.tsx` · `otp-form.tsx` · `sign-out-button` · `dashboard/page.tsx` |
| استيراد التحدي الهاش | `apps/web/src/lib/utils/otp.ts` (`hashOtpCode`، `getOtpResendCooldownSeconds`) |

**التحقق:** `npm run test:e2e` → **18/18** (البنية 4/4 + مصادقة 5/5 + Step-up/Sudo 2/2 — E2E.1.6 §14 + دفع الضيف 7/7 — E2E.2 §15 + E2E.3 §16)، `tsc --noEmit` نظيف، `next lint` بلا أخطاء. (ضجيج `[WebServer]` حول Redis «Connection is closed» هو المسار المتعمَّد fail-open لعربة الـ limiter — وليس فشل اختبار.)

---

## 14) 🔐 E2E.1.6 — Step-up Authentication / Sudo Mode (المصادقة الحسّاسة)

**خلفية المنتج (docs/SUPER-ADMIN-ARCH.md §SA.6):** بعد جلسة مُوثّقة بالكامل (pass + OTP)، تفرض البوابة `withSudoMode` إعادة إثبات الهوية (كود Step-up يُرسَل بريداً) قبل أي طفرة على `/api/superadmin/integrations` — تُفحَص البطاقة المكوَّنة `su_token` (JWT عديم الحالة، نطاق `superadmin:integrations`، نافذة سودو 5 دقائق) **في طبقة الحارس وليس طبقة الهوية**.

السيناريوان (اختباران): رحلة سودو كاملة + رفض شامل لتزوير `su_token`. أدواتها ترث §13: `--project chromium`, webServer على `:3100` (prod build), قاعدة `hotel_e2e` مستقلة, Prisma Injection على تحدي `SUPER_ADMIN_STEP_UP`, تزوير عبر `jose` بالمفتاح الصحيح/الخاطئ.

### 14.1 الحفرة الفريدة: `Secure` كوكي ≠ `page.request` (Root Cause + الحل)

**الاكتشاف:** الخادم المبني (`next start` → `NODE_ENV=production`) يضع كل كوكيات الجلسة (`accessToken`/`refreshToken`/`csrf-token`) بعلامة **`Secure`**. متصفح Chromium **يرسلها فعلاً** إلى `http://127.0.0.1` (يُعامَل كأصل موثوق — لذلك تُرسم لوحة التحكم)، **لكن `page.request` في Playwright ليس المتصفح**: إنه عميل HTTP بـ Node يلتزم RFC 6265 بدقّة، فلا يرسل كوكي `Secure` فوق http صريح — فتتحطم كل نداءات API بـ `401` (لا `accessToken`) و`403` لو استُخدم CSRF (لا `csrf-token`).

**البرهان التجريبيّ (وزن خفيف، خارج الملف):** `addCookies([{secure:false…}])` يُرسَل (200)؛ `addCookies([{secure:true…}])` لا يُرسَل (401) — فوق `http://127.0.0.1`.

**الحل المعتمَد (طُبِّق في `loginAndBootCsrf`):** إعادة سكّ كوكيات الجلسة بلا علامة `Secure` عبر `context.addCookies` (نفس الاسم/النطاق/المسار — يحلّ محل نسخة الخادم). **صفر تغيير في كود الإنتاج** — تماماً كفلسفة Prisma Injection. هذا هو سبب بقاء E2E.1.5 أخضر: كل نداءاتها كانت تصفحاً للمتصفح + تفحّص `context.cookies()` فقط، لا نداءات API موثّقة عبر `page.request`.

> **قاعدة للمستقبل:** أي نداء API موثّق جديد عبر `page.request` في E2E يجب أن يمرّ بـ `demoteSessionCookies` (§14.3) — حتى يمتلك المتصفحُ والـ API نفسَ الجلسة فوق http.

### 14.2 السيناريوهان

| # | السيناريو | أبرز الفحوص |
|---|---|---|
| 1 | رحلة سودو كاملة | GET خارج السودو (200) · POST بلا سودو → `403 STEP_UP_REQUIRED` · رمز خاطئ → `401 INVALID` + `attempts=1` · **Prisma Time Injection** لكود منتهٍ → `410 EXPIRED` · تحدٍّ حي + كود صحيح → `su_token` (نطاق/هدف/`jti`/نافذة ≤300s) · **استخدام واحد** للكود (إعادة الاستخدام → `401`) · **نافذة الاستخدام**: 3 عمليات بنفس البطاقة بلا إعادة OTP · حذف · ميزان `IntegrationConfig = 0` · سجل التدقيق الكامل |
| 2 | تزوير `su_token` | مفتاح خاطئ → `403 STEP_UP_EXPIRED` (+1 `STEP_UP_EXPIRED_REJECTED`) · منتهٍ بمفتاح صحيح → `403 STEP_UP_EXPIRED` (+1) · **نطاق خاطئ** → `403 STEP_UP_REQUIRED` (بلا ضجيج تدقيق) · **موضوع مختلف** → `403 STEP_UP_REQUIRED` (بلا ضجيج) · صفر تسريب في `IntegrationConfig` |

### 14.3 الملفات ومساعد السكريت

| المكوّن | الملف |
|---|---|
| السيناريوهان | `apps/web/tests/e2e/superadmin-step-up.spec.ts` |
| إبطال `Secure` الكوكيات | `demoteSessionCookies` (المساعد داخل نفس الملف) — مستند السبب الجذري في تعليق §14.1 |
| أسرار مطابقة الخادم | `getSudoTokenSecret()`/`verifySudoToken` من `apps/web/src/lib/utils/jwt.ts` (dev fallback مُطابق للخادم) |

**التحقق:** `npm run test:e2e` → **18/18** (2.8m؛ البنية 4 + مصادقة 5 + سودو 2 + دفع الضيف 7 — E2E.2 §15 + E2E.3 §16)، حصاد الاستخدام: نداءا request (≤3/15د) و4 نداءات verify (≤5/60ث) في الاختبار 1 وصفر في الاختبار 2 (تزوير لا يلمس الـ request/verify). `tsc --noEmit` نظيف.

---

## 15) 💳 E2E.2 — رحلة دفع الضيف (Guest Payment Journey — Plutu)

**خلفية المنتج (docs/FRONTEND-CHECKOUT-ARCH.md):** صفحة `/booking/[id]/checkout` عامة (بلا جلسة) تعرض رصيد Folio وتحوّل الضيف لمزوّد الدفع. مساران: `POST /api/public/bookings/[id]/payment-session` (إنشاء الجلسة) و`GET .../payment-session/[sessionId]/status` (استطلاع الحالة من شاشة «غير المؤكَّدة»). تحقق `?step=success` عبر `getVerifiedSucceededSession` (SUCCEEDED) وإلا شاشة `UnverifiedSuccessView` التي تستطلع 5×3ث ثم «تعذر تأكيد حالة الدفع».

السيناريوان (اختباران) في `tests/e2e/guest-payment.spec.ts` على منصة **Plutu** عبر Dummy Gateway (`:4400`) وأصيل التطبيق المبني (`:3100`):

| # | السيناريو | أبرز الفحوص |
|---|---|---|
| 1 | الرحلة السعيدة | اختيار `gateway-card-plutu` → «التوجيه للبوابة» (`checkout-redirect-gateway`) → `waitForURL(**/pay/**)` → `dg-succeed` → العودة `?step=success` (`checkout-success`) → **الدفتر**: Folio رصيد **0**/`SETTLED`/`settledAt`، الجلسة `SUCCEEDED` ومربوطة بالدفعة، `Payment PLUTU 250`، حركة `FolioTransaction −250`، `GatewayWebhook PROCESSED` مربوط بالجلسة والدفعة |
| 2 | رفض الويب هوك المزوَّر | نفس التوجيه حتى صفحة البوابة → كشف سجلّ الـ create عبر `__control/creates` (مطابقة `orderId` ببادئة `pay_{bookingId}_`) → `__control/forge` (توقيع `0…1`) → **`401 UNAUTHORIZED`** → الدفتر **بلا مساس** (رصيد ثابت/`ACTIVE`، جلسة `PENDING`، `count(Payment)=0`، `count(GatewayWebhook)=0`، صفر حركات) → `dg-cancel` → العودة → شاشة «غير مؤكَّدة» تظهر ثم «تعذر تأكيد حالة الدفع» بعد استنفاد الاستطلاع |

### 15.1 البذر والبسَاطة: شجرة كاملة بلا تخفيف

`tests/e2e/setup/seed-guest-payment.ts` يُنشئ **Hotel → RoomType → Room → Guest → Booking (PENDING) → BookingRoom → Folio (رصيد 250) → IntegrationConfig** (engine `plutu`، kind `PAYMENT_GATEWAY`، isActive). قرارات مؤثّرة:

- **`apiKeyEnc` يُشفَّر فعلاً** (`encryptSecret` AES-GCM بمفتاح `PAYMENT_CRYPTO_KEY='a'.repeat(64)` يضبطه الاختبار في `process.env` قبل الاستدعاء) ويحوي `{merchantId, secretKey}` — أمّا `config` فنصّ JSON **غير مُشفَّر** (`{baseUrl: DUMMY_BASE, returnUrl, callbackUrl}`) لأن `overlayConfigFields` لا يفكّ `config` إطلاقاً. النتيجة: يمرّ الـ seed عبر مسار `resolveGatewayConfig` الإنتاجي (source `db`، عقود `CONTRACT_SECRETS` مطابقة للتوقيع) — لا خيوط مساعدة.
- **مطابقة الويب هوك عبر `merchantTxId` وليس `gatewayTransactionId`:** التطبيق يخزّن `gatewayTransactionId = session_id` (dummy) بينما حمولة الويب هوك تحمل `transaction_id` (`txn_…`) — مطابقة `orderId` (`pay_{bookingId}_{ts}`) تلتقط السجل الصحيح.

### 15.2 الكسوران المكتشفان في أثناء الرحلة (Root Cause + الحل)

1. **Dummy Gateway — زر «العودة دون دفع».** كان `dg-cancel` نموذج `GET` يَحمُل `action=return_url`؛ عند الإرسال يستبدل المتصفح **استعلام النموذج (الفارغ)** باستعلام الـ action فيُسقط `?step=success` فيعود الضيف لشاشة اختيار الطريقة (وليس «غير المؤكَّدة»). الحل: نموذج `POST` بمسار `outcome=cancel` يُدير الخادم **`302` نحو `return_url` الكاملة دون إرسال أي webhook** — العودة بلا دفع لا تُرسل إشعاراً (مطابق للواقع ولبقية الأزرار التي تعيد عبر 302 خادمي لا عبر المتصفح).
2. **مسارا الإنشاء والحالة أمام انقطاع Redis.** `POST /payment-session` و`GET /payment-session/[sessionId]/status` يُسمّيان `checkRateLimit` مباشرة؛ عند توقف Redis يرمي الـ limiter «Connection is closed» → **500** على مسار عام. بقية المسارات (OTP/Step-up) تلجأ fail-open — وهذان كانا شاذّيْن. الحل: تعليق الاستدعاء في try/catch (منطق `429`/`Retry-After` محفوظ حرفياً)، فيسجّل الخادم «Redis limiter unavailable, failing open» ويمضي؛ التحصين الثاني أبقى استطلاع شاشة «غير المؤكَّدة» يعمل بدل كسره.

### 15.3 وسوم الاختبار (data-testid)

| الوسم | الموقع |
|---|---|
| `gateway-card-{id}` | `(public)/booking/[id]/checkout/components/GatewaySelectorCard.tsx` |
| `checkout-redirect-gateway` | `…/components/RedirectingView.tsx` |
| `checkout-success` | `…/components/SuccessView.tsx` |
| `checkout-unverified` | `…/components/UnverifiedSuccessView.tsx` |
| `dg-succeed` / `dg-cancel` (ضيف الجزء الساند) | `tests/contracts/dummy-gateway/server.ts` |

### 15.4 الملفات

| المكوّن | الملف |
|---|---|
| السيناريوهان | `apps/web/tests/e2e/guest-payment.spec.ts` |
| بذر الشجرة الكاملة | `apps/web/tests/e2e/setup/seed-guest-payment.ts` |
| تحسين Dummy Gateway | `apps/web/tests/contracts/dummy-gateway/server.ts` (مسار `cancel` + `302`) |
| تحصين limiter (fail-open) | `payment-session/route.ts` · `payment-session/[sessionId]/status/route.ts` |

**التحقق:** `npm run test:e2e` → **13/13** (2.2m؛ بنية 4 + مصادقة 5 + سودو 2 + دفع الضيف 2)، `tsc --noEmit` نظيف، `next lint` بلا أخطاء جديدة. ضجيج `[WebServer]` «Redis limiter unavailable, failing open» هو المسار المتعمَّد، لا فشلاً.

---

## 16) 💳 E2E.3 — تكملة رحلة دفع الضيف (السيناريوهات الباقية من §6)

استكمالاً لـ §15، تغطي **خمسة** سيناريوهات جديدة بقية بنود قائمة §6 على نفس `tests/e2e/guest-payment.spec.ts` وسطر التحكم في Dummy Gateway (`:4400`): نجاح **T-Lync** (#2)، **فشل الدفع** (#3)، **العودة قبل الـ webhook ثم تسوية البوابة** (#4 — حلقة M6 الفعلية)، **ازدواج الـ webhook** (#6)، و**create مرفوض** (#7):

| # | السيناريو | أبرز الفحوص |
|---|---|---|
| 1 | نجاح T-Lync | `seedGuestBooking(..., gateway:'tlync')` → `gateway-card-tlync` → `dg-succeed` → `checkout-success` (بوابة ثانية كاملة عبر `resolveGatewayConfig` DB) — `Payment.method=TLYNC`/`gateway=tlync`، Webhook `payment.success PROCESSED` مربوط بالجلسة والدفعة، Folio `SETTLED` |
| 2 | فشل الدفع | `dg-fail` → Dummy يُسلّم **`FAILED` webhook قبل** العودة إلى `?step=success` → شاشة «غير المؤكَّدة» تستنفد الاستطلاع → «تعذر تأكيد حالة الدفع»؛ الجلسة **`FAILED`**، صفر `Payment`/`FolioTransaction`، رصيد ثابت، Webhook واحد `payment.failed PROCESSED` |
| 3 | العودة قبل الـ webhook ثم تسوية البوابة (حلقة M6) | `dg-cancel` (بلا webhook — العودة لا تُرسل شيئاً) → الاستطلاع يعمل («في انتظار تأكيد الدفع») → خط التحكم `__control/settle` (SUCCESS) → الاستطلاع يلتقط تحوّل الجلسة إلى `SUCCEEDED` → **`checkout-success` تُرسم**؛ الدفتر يُصفَّر مرة واحدة |
| 4 | ازدواج الـ webhook | `__control/duplicate` يسلّم حمولتين متطابقتين متتاليتين → الدمج على **`@@unique([provider, hotelId, eventId])`** → Webhook واحد `PROCESSED`، دفعة واحدة، `FolioTransaction` واحدة، `SETTLED` مرة واحدة |
| 5 | create مرفوض | `__control/fail-create {provider:'plutu'}` → `POST /payment-session` يعيد `502` ولا يُنشئ صفّاً (إنشاؤه **بعد** نجاح البوابة) → `FailedView` («فشل الدفع») يعرض «فشل إنشاء جلسة الدفع» عبر `role=alert`، صفر `PaymentSession`، الدفتر سليم |

### 16.1 البذر معرَّب للبوابتين

`seed-guest-payment.ts` يقبل `gateway?: 'plutu' | 'tlync'` (افتراضياً `plutu`؛ لا أثر على سيناريوهي §15). لكل بوابة: Hotel/bookingNo باسم البوابة + صف `IntegrationConfig` engine مطابق (engine `tlync` → فكّ `{merchantId, secretKey}` ليستخدمها العقد الأصيل `resolveGatewayConfig`)، و`callbackUrl` نحو `.../gateways/{gateway}/webhook`. البذر يبقى **فريد البيانات لا تهيئة** — كل سيناريو فندق/حجز جديدان لا يتقاطعان.

### 16.2 الكسر الإنتاجي الذي كشفه السيناريو 3 (Root Cause + الحل)

**الاكتشاف:** شاشة «غير المؤكَّدة» (`UnverifiedSuccessView.tsx`) تستطلع `GET /payment-session/[sessionId]/status` وتقرأ نتيجة التحقق من `body?.verified` — لكن المسار يردّ عبر `successResponse({verified})` التي تغلّفها كـ `{ success: true, data: { verified } }`. فالشرط `body?.verified === true` هو **`undefined === true` دائماً** → لا تنقلب الشاشة أبداً إلى النجاح، حتى بعد تسويةٍ حقيقية متأخّرة. لم تُرَ في §15 لأن السيناريوهين لا يتطلبان الانقلاب (السعيدة تصل النجاح عبر SSR، والمزوَّر يُفحَص على الاستنفاد فقط).

**الحل:** صار `fetchVerified` يقرأ `body?.data?.verified === true` — سطر واحد في `apps/web/src/app/(public)/booking/[id]/checkout/components/UnverifiedSuccessView.tsx` — فيعمل «العودة قبل الـ webhook ثم التسوية» (حلقة M6 في §6/السيناريو 4) فعلياً: الضيف يعود بلا دفع، تُسلَّم البوابة لاحقاً، والاستطلاع ينقلب وحده إلى النجاح.

### 16.3 الملفات

| المكوّن | الملف |
|---|---|
| السيناريوهات الخمسة | `apps/web/tests/e2e/guest-payment.spec.ts` |
| البذر المعرَّب للبوابتين | `apps/web/tests/e2e/setup/seed-guest-payment.ts` |
| إصلاح الاستطلاع (كسر M6) | `apps/web/src/app/(public)/booking/[id]/checkout/components/UnverifiedSuccessView.tsx` |

**التحقق:** `npm run test:e2e` → **18/18** (2.8m؛ بنية 4 + مصادقة 5 + سودو 2 + دفع الضيف 7)، `tsc --noEmit` نظيف، `next lint` بلا أخطاء جديدة.
