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
```

> **ملاحظة:** في بيئة التطوير (`NODE_ENV !== 'production'`)، إذا كانت `*_WEBHOOK_IPS` فارغة، يسمح النظام بكل الـ IPs مع تحذير في اللوج — **يجب تكوينها في الإنتاج**.

---

## 3. آلية منع انكسار الويب هوك عند تغيير الإعدادات (Config Mutation Protection)

### المشكلة
إذا قام الفندق بتحديث `IntegrationConfig` (تغيير `secretKey` مثلًا) أثناء وجود جلسة دفع `PENDING`، سيفشل التحقق من الـ Webhook لأن التوقيع سيُحسب بالمفتاح الجديد بينما البوابة أرسلته بالمفتاح القديم.

### الحل: **Snapshot في `PaymentSession.gatewayConfig`**

عند إنشاء جلسة الدفع (`POST /api/public/bookings/[id]/payment-session`):

```typescript
gatewayConfig: JSON.stringify({
  merchantId: config.merchantId,
  secretKey: config.secretKey,        // المفتاح المستخدم وقت الإنشاء
  baseUrl: config.baseUrl,
  returnUrl: config.returnUrl,
  callbackUrl: config.callbackUrl,
  capturedAt: new Date().toISOString(),
})
```

في الـ Webhook handler:
1. يحاول قراءة `secretKey` من `paymentSession.gatewayConfig` أولاً
2. إذا فشل (JSON غير صالح أو مفتاح مفقود) → يرجع للإعدادات الحالية (`adapter.config`)
3. هذا يضمن أن الجلسات المفتوحة قبل تغيير الإعدادات تظل تعمل

---

## 4. Rate Limiting — التنفيذ الذري (Atomic Sliding Window)

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
- [ ] اختبار Webhook يدوي من sandbox لكل بوابة
- [ ] اختبار Rate Limit: إرسال 6 طلبات سريعة → يتوقع 429 في الطلب السادس
- [ ] اختبار IP Whitelist: طلب من IP غير مصرح → يتوقع 403
- [ ] اختبار Config Mutation: إنشاء جلسة → تحديث IntegrationConfig → إرسال Webhook → يتوقع نجاح