# AGENTS.md — دستور العمل (Codex Constitution V3)

قواعد ملزمة لكل جلسة عمل على هذه القاعدة البرمجية. أي انتهاك يُعدّ خللاً جسيماً في النظام ويجب تصحيحه فوراً.

## القسم الأول: الصرامة التقنية والأمنية (Technical Strictness)

### 1. Zero Tolerance for Type Bypassing
- يمنع منعاً باتاً استخدام `any`، `as unknown`، `as any`، أو `@ts-ignore` للهروب من مترجم TypeScript.
- الكود الأعمى (untyped) مرفوض. المعاملات والطبقات الحساسة تُلزم بالأنواع الصريحة (مثل `TenantTxClient` و `Prisma.TransactionClient`).

### 2. Tooling & Encoding Safety
- يحظر مطلقاً استخدام أوامر PowerShell (خاصة `Set-Content`) لكتابة أو تعديل ملفات الكود لتجنب إتلاف ترميز UTF-8 وتفسير الأقواس `[id]` كـ Wildcards.
- استخدم أداة الـ `Edit` أو `Write` المدمجة، أو أوامر `bash` / `psql` حصراً.

### 3. Server Orchestration Strictness
- يمنع منعاً باتاً تشغيل اختبارات E2E أو أي `next build` بينما خادم التطوير `next dev` يعمل على المنفذ 3210 لتجنب تدمير مجلد `.next` المشترك.

### 4. E2E Realism Rule
- لا توجد طرائق مختصرة في بذر بيانات الاختبار (Seeding). تُزرع أشجار البيانات كاملة كما في الإنتاج (Hotel → RoomType → Room → Guest → Booking → BookingRoom → Folio → IntegrationConfig) حتى لو كانت الحقول `Nullable`.

### 5. Migration Rules (RLS & Tenancy)
- يحظر استخدام `prisma migrate dev` (معطوب على هذه القاعدة بسبب انحرافات قديمة).
- استخدم `prisma db push` لمزامنة الـ Schema، واكتب سكربتات (Raw SQL) يدوية لترحيلات RLS، وطبّقها عبر `psql -f`.
- **(أتمتة بيئة الاختبار):** على قواعد البيانات الجديدة (مثل استخدام `E2E_FRESH_DB=1`)، بعد `prisma db push`، يجب تشغيل سكربت `npx tsx scripts/apply-rls.ts` ضد قاعدة بيانات الاختبار لتثبيت الـ 19 تريجر الدفاعي وسياسات الـ RLS تلقائياً.

---

## القسم الثاني: هندسة الواجهات والأمان (Frontend & Security)

### 6. Monorepo Architecture & Modularization
- **تجزئة الكود (Micro-Modularization):** يمنع كتابة ملفات Monolithic ضخمة. قسّم الواجهات المعقدة إلى مكونات صغيرة.
- **الفصل المعماري:** المكونات المشتركة ودوال المساعدة توضع في `packages/shared/src/`. المنطق الخاص بتطبيق الويب فقط يوضع في `apps/web/`.

### 7. Auth & Session Guardrails
- يمنع على العميل (Client) قراءة أو التحقق من ملفات تعريف الارتباط `httpOnly`. حالة المصادقة تُستمد من استجابات الـ API فقط.
- الميدل وير (Middleware) هو مصدر الحقيقة الوحيد للوصول؛ لا تكرر منطق التوجيه في مكونات React.

### 8. Secrets & Env Hygiene
- يُمنع كشف أسرار التشفير للواجهة الأمامية عبر بادئة `NEXT_PUBLIC_`. الأسرار (مثل `PAYMENT_CRYPTO_KEY`) يجب أن تبقى في طبقة الخادم (`process.env`).

---

## القسم الثالث: سير العمل والتوثيق (Workflow & Living Docs)

### 9. No Silent Edits & Production Fixes
- يمنع تغيير أي مسار معماري (Schema، توجيه RLS) بصمت. استخدم **"ARCH DEVIATION"** في التقرير عند الضرورة.
- يُسمح بتعديل كود الإنتاج أثناء الـ E2E فقط لإصلاح خطأ إنتاجي حقيقي، بشرط توثيق ذلك فوراً في الـ Changelog.

### 10. Living Documentation (Sync-README-on-Change)
- ملف `README.md` هو مصدر الحقيقة الوحيد. يجب تحديثه **فوراً** ليعكس أي: ميزة جديدة، تعديل في الـ Schema، أو تغيير في مسارات الـ API.
- لكل مرحلة جديدة، قم بإنشاء ملف مهام مرقم (مثل `todo_v8.md`) ولا تقم بالكتابة فوق `todos.md` العام.

---

## مراجع معمارية أساسية (يجب العودة إليها)
- `docs/M8-RLS-ARCH.md` — تحصين تعدد المستأجرين (أدوار، RLS، TenantTxClient، التطويقات).
- `apps/web/prisma/rls/rls.sql` — الخراج الترميزي لسياسات الـ RLS (مُلزم للتطبيق).
- `apps/web/src/lib/utils/prisma.ts` — العميلان `prisma` و `prismaPlatform`، وحقن `hotelId` المركزي.
- `apps/web/scripts/apply-rls.ts` — نقطة الدخول الأساسية لتشغيل RLS bootstrap والـ Triggers على قواعد البيانات.