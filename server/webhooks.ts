import crypto from 'crypto';

export function generateWebhookSign(body: string, secret: string): string {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `v1=${hash}`;
}

export function verifyWebhookSignature(rawBody: string, secret: string, headerSig: string | undefined): boolean {
  const expected = generateWebhookSign(rawBody, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(headerSig ?? ''));
  } catch {
    return false;
  }
}
