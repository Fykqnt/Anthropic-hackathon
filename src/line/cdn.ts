type Entry = { buf: Buffer; mime: string; expiresAt: number };

function getMap(): Map<string, Entry> {
  const g = globalThis as unknown as { __LINE_CDN__?: Map<string, Entry> };
  if (!g.__LINE_CDN__) g.__LINE_CDN__ = new Map();
  return g.__LINE_CDN__;
}

export function put(buf: Buffer, mime: string, ttlMs = 10 * 60 * 1000): string {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const expiresAt = Date.now() + ttlMs;
  getMap().set(id, { buf, mime, expiresAt });
  return id;
}

export function get(id: string): { buf: Buffer; mime: string } | undefined {
  const entry = getMap().get(id);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    getMap().delete(id);
    return undefined;
  }
  return { buf: entry.buf, mime: entry.mime };
}

