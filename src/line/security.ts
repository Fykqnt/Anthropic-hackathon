import { createHmac, timingSafeEqual } from 'node:crypto';

export function signLineBody(secret: string, body: string | Buffer): string {
  const h = createHmac('sha256', secret);
  h.update(typeof body === 'string' ? Buffer.from(body) : body);
  return h.digest('base64');
}

export function verifyLineSignature(
  secret: string,
  body: string | Buffer,
  signature: string | null | undefined,
): boolean {
  if (!signature) return false;
  try {
    const expected = Buffer.from(signLineBody(secret, body));
    const given = Buffer.from(signature);
    // Prevent subtle timing attacks
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

