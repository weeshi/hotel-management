import crypto from 'node:crypto';

export type ContractGateway = 'plutu' | 'tlync';

export const CONTRACT_SECRETS: Record<ContractGateway, { secretKey: string; merchantId: string }> = {
  plutu: { secretKey: 'sec_key_test_plutu_9e3f', merchantId: 'mer_test_plutu_0001' },
  tlync: { secretKey: 'sec_key_test_tlync_7a2b', merchantId: 'mer_test_tlync_0002' },
};

export function plutuSign(params: Record<string, unknown>, secretKey: string): string {
  const sortedKeys = Object.keys(params).sort();
  const signatureString =
    sortedKeys.map((k) => `${k}=${String(params[k])}`).join('&') + `&secret=${secretKey}`;
  return crypto.createHash('sha256').update(signatureString).digest('hex');
}

export function plutuVerifySignature(payload: Record<string, unknown>, secretKey: string): boolean {
  const received = payload.signature;
  if (typeof received !== 'string' || !received) return false;

  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key !== 'signature' && value !== undefined && value !== null) {
      params[key] = value;
    }
  }

  const expected = plutuSign(params, secretKey);
  try {
    return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function tlyncHmacSign(payload: Record<string, unknown>, secretKey: string): string {
  const sortedKeys = Object.keys(payload).filter((k) => k !== 'signature').sort();
  const signatureString = sortedKeys.map((k) => `${k}=${String(payload[k])}`).join('&');
  return crypto.createHmac('sha256', secretKey).update(signatureString).digest('hex');
}

export function tlyncVerifySignature(payload: Record<string, unknown>, secretKey: string): boolean {
  const received = payload.signature;
  if (typeof received !== 'string' || !received) return false;

  const expected = tlyncHmacSign(payload, secretKey);
  try {
    return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function buildSignedWebhook(
  provider: ContractGateway,
  base: Record<string, unknown>,
  secretKey: string,
): Record<string, unknown> {
  const unsigned = { ...base };
  delete unsigned.signature;
  const signature =
    provider === 'plutu' ? plutuSign(unsigned, secretKey) : tlyncHmacSign(unsigned, secretKey);
  return { ...unsigned, signature };
}

export function providerWebhookIdField(provider: ContractGateway): string {
  return provider === 'plutu' ? 'transaction_id' : 'tran_id';
}