import { describe, it, expect, vi } from 'vitest';
import { InMemoryImageStore } from '../src/line/store';

describe('InMemoryImageStore', () => {
  it('stores and retrieves by userId, evicts by ttl', async () => {
    vi.useFakeTimers();
    const store = new InMemoryImageStore({ ttlMs: 1000 });
    const data = Buffer.from('abc');
    await store.set('U123', { data, mimeType: 'image/png' });
    const got = await store.get('U123');
    expect(got?.mimeType).toBe('image/png');
    expect(got?.data.equals(data)).toBe(true);

    // advance beyond ttl
    vi.advanceTimersByTime(1001);
    const expired = await store.get('U123');
    expect(expired).toBeUndefined();
    vi.useRealTimers();
  });
});

