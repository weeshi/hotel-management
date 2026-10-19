# مستندات الأمان — بوابات الدفع المحلية (Local Payment Gateways)

## 1. الحماية متعددة الطبقات (Defense in Depth)

| الطبقة | التنفيذ | الحالة |
|------|---------|-------|
| **توقيع الطلب (Signature Verification)** | HMAC-SHA256 (T-Lync) / SHA-256 (Plutu) مع `crypto.timingSafeEqual` | ✅ مطلوب |
| **IP Whitelisting** | `PLUTU_WEBHOOK_IPS` / `TLYNC_WEBHOOK_IPS` (CIDR + exact IP) | ✅ مطلوب للإنتاج |
| **Idempotency Key** | `GatewayWebhook.@@unique(provider, hotelId, eventId)` | ✅ مطلوب |
| **Rate Limiting** | Redis Lua Script (Atomic Sliding Window) | ✅ نشط |

---

## 2. متغيرات البيئة المطلوبة (Production)

```bash
# Plutu
PLUTU_MERCHANT_ID=your_merchant_id
PLUTU_SECRET_KEY=your_secret_key
PLUTU_WEBHOOK_IPS=192.0.2.0/24,203.0.113.50  # CIDR أو IPs دقيقة مفصولة بفاصلة
PLUTU_RETURN_URL=https://yourdomain.com/payment/return
PLUTU_CALLBACK_URL=https://yourdomain.com/api/external/gateways/plutu/webhook

# T-Lync
TLYNC_MERCHANT_ID=your_merchant_id
TLYNC_SECRET_KEY=your_secret_key
TLYNC_WEBHOOK_IPS=198.51.100.0/24,198.51.100.50
TLYNC_RETURN_URL=https://yourdomain.com/payment/return
TLYNC_CALLBACK_URL=https://yourdomain.com/api/external/gateways/tlync/webhook

# Redis (للـ Rate Limiter + BullMQ)
REDIS_URL=redis://:password@host:6379

# تجاوز اختياري للـ IP Whitelist (للاختبار فقط — لا تستخدم في الإنتاج!)
# DANGER_BYPASS_WEBHOOK_IP_CHECK=true
```

> **ملاحظة أمنية:** في بيئة الإنتاج، **يجب** تكوين `*_WEBHOOK_IPS` بقوائم IPs رسمية من البوابات. النظام يعمل بـ **Fail-Closed** — إذا كانت القائمة فارغة ولم يُضبط `DANGER_BYPASS_WEBHOOK_IP_CHECK=true`، يرفض جميع الطلبات بـ 403. متغير `DANGER_BYPASS_WEBHOOK_IP_CHECK=true` للاختبار فقط ولا يجب تفعيله في الإنتاج.

---

## 3. آلية منع انكسار الويب هوك عند تغيير الإعدادات (Config Mutation Protection)

### المشكلة
إذا قام الفندق بتحديث `IntegrationConfig` (تغيير `secretKey` مثلًا) أثناء وجود جلسة دفع `PENDING`، سيفشل التحقق من الـ Webhook لأن التوقيع سيُحسب بالمفتاح الجديد بينما البوابة أرسلته بالمفتاح القديم.

### الحل: **Encrypted Snapshot في `PaymentSession.gatewayConfig`**

عند إنشاء جلسة الدفع (`POST /api/public/bookings/[id]/payment-session`):

```typescript
const sensitiveConfig = {
  merchantId: config.merchantId,
  secretKey: config.secretKey,
  baseUrl: config.baseUrl,
  returnUrl: config.returnUrl,
  callbackUrl: config.callbackUrl,
  capturedAt: new Date().toISOString(),
};

// تشفير AES-256-GCM باستخدام مفتاح المنصة (PAYMENT_CRYPTO_KEY)
const encryptedConfig = encryptSecret(JSON.stringify(sensitiveConfig));

// التخزين مشفراً — لا يوجد plaintext في قاعدة البيانات
gatewayConfig: encryptedConfig,
```

في الـ Webhook handler:
1. يحاول قراءة وفك تشفير `gatewayConfig` من الجلسة أولاً
2. `decryptSecret()` يعيد الـ JSON الأصلي → يستخرج `secretKey`
3. إذا فشل الفك (مفتاح تالف، تنسيق غير صالح) → يرجع للإعدادات الحالية (`adapter.config`)
3. هذا يضمن أن الجلسات المفتوحة قبل تغيير الإعدادات تظل تعمل، **بدون تخزين أي secret كنص مكشوف**

> **ملاحظة أمنية:** التشفير يستخدم `PAYMENT_CRYPTO_KEY` (مفتاح المنصة، 32 بايت hex) مع AES-256-GCM — نفس الآلية المستخدمة في `IntegrationConfig.apiKeyEnc`.

> **ملاحظة SA.4.5 (الربط بالتشغيل):** `config` في المقطع أعلاه لم يعد من `.env` مباشرة — بل نتاج `resolveGatewayConfig(gateway, { hotelId: booking.hotelId })` (انظر `SUPER-ADMIN-ARCH.md` §7.5): قراءة DB واحدة بلا Cache، الصف المخزَّن في `IntegrationConfig` هو المرجع، و`.env` ملاذ أخير **فقط** عند غياب الصف (رفض عند تعطيل/نقص السرّ — لا عبور-مستأجر). الـ Webhook يبقى يتحقق من هذه اللقطة أولاً؛ اختبار التدوير في منتصف الجلسة مؤتمت في `tests/integration/gateway-wiring.test.ts`.

---

## 4. Rate Limiting — التنفيذ الذري (Atomic Sliding Window) مع NOSCRIPT Fallback

### الكود: `src/lib/rate-limiter.ts`

```lua
-- KEYS[1] = rate limit key
-- ARGV[1] = now (seconds)
-- ARGV[2] = window (seconds)
-- ARGV[3] = limit
-- ARGV[4] = unique member (timestamp-uuid)

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local current = redis.call('ZCARD', key)
if current >= limit then return {0, current, ttl} end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, window + 1)
return {1, current + 1, window}
```

### خصائص الأمان:
- **Atomic Check-and-Set**: `redis.evalsha` ينفذ السكريبت كعملية واحدة — لا يوجد race condition
- **`crypto.randomUUID()`**: يضمن تفرد الـ member داخل الـ Sorted Set (لا `Math.random()`)
- **Sliding Window دقيق**: يحذف الإدخالات المنتهية ثم يعد الحاليين
- **TTL تلقائي**: المفتاح ينظف نفسه بعد `window + 1` ثانية
- **NOSCRIPT Fallback**: إذا فُقد السكريبت من ذاكرة Redis (إعادة تشغيل، Flush)، الكود يلتقط خطأ `NOSCRIPT` وينفذ السكريبت مباشرة عبر `redis.eval` — لا ينهار النظام أبداً

### الاستخدام:
```typescript
import { checkRateLimit } from '@/lib/rate-limiter';

const result = await checkRateLimit('ratelimit:payment-session:booking123:1.2.3.4', 5, 60);
if (!result.allowed) {
  return res.status(429).json({
    error: { code: 'RATE_LIMITED', retryAfter: result.resetAt - Math.floor(Date.now()/1000) }
  });
}
```

### الحدود الحالية:
| المسار | الحد | النافذة | المفتاح |
|-------|------|--------|-------|
| `POST /api/public/bookings/[id]/payment-session` | 5 طلب | 60 ثانية | `ratelimit:payment-session:{bookingId}:{clientIp}` |

---

## 4. سجلات التدقيق (Audit Trail)

كل عملية تحفظ في `GatewayWebhook`:

| الحقل | الوصف |
|------|-------|
| `provider` | `plutu` / `tlync` |
| `hotelId` | نطاق المستأجر |
| `eventId` | `transaction_id` / `tran_id` من البوابة |
| `type` | `payment.success` / `payment.failed` |
| `payload` | JSON الخام للطلب (للتدقيق لاحقاً) |
| `status` | `RECEIVED` → `PROCESSED` / `DUPLICATE` |
| `paymentId` | ربط بالدفعة النهائية عند النجاح |
| `paymentSessionId` | ربط بالجلسة |

---

## 5. قائمة التحقق قبل النشر (Pre-Deployment Checklist)

- [ ] `PLUTU_WEBHOOK_IPS` مضبوط بقائمة IPs رسمية من Plutu
- [ ] `TLYNC_WEBHOOK_IPS` مضبوط بقائمة IPs رسمية من T-Lync
- [ ] مفاتيح `SECRET_KEY` مخزنة بشكل آمن (ليس في الكود)
- [ ] `REDIS_URL` يشير لRedis إنتاجي مع كلمة مرور
- [ ] `PAYMENT_CRYPTO_KEY` مضبوط (32 بايت hex) — مطلوب لتشفير `gatewayConfig`
- [ ] اختبار Webhook يدوي من sandbox لكل بوابة
- [ ] اختبار Rate Limit: إرسال 6 طلبات سريعة → يتوقع 429 في الطلب السادس
- [ ] اختبار IP Whitelist: طلب من IP غير مصرح → يتوقع 403
- [x] اختبار Config Mutation: إنشاء جلسة → تحديث IntegrationConfig → إرسال Webhook → يتوقع نجاح (**مؤتمت**: `tests/integration/gateway-wiring.test.ts` — «تدوير المفتاح في منتصف الجلسة والـ Webhook بالمفتاح القديم يمر`)
- [ ] اختبار NOSCRIPT Fallback: إعادة تشغيل Redis → إرسال طلبات → لا ينهار الـ Rate Limiter
- [ ] التحقق أن `DANGER_BYPASS_WEBHOOK_IP_CHECK` **غير مضبوط** في الإنتاج