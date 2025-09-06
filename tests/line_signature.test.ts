import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyLineSignature } from '../src/line/security';

describe('verifyLineSignature', () => {
  const secret = 'test_secret';
  const body = JSON.stringify({ events: [] });

  it('returns true for valid signature', () => {
    const sig = createHmac('sha256', secret).update(body).digest('base64');
    expect(verifyLineSignature(secret, body, sig)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    expect(verifyLineSignature(secret, body, 'invalid')).toBe(false);
  });
});

