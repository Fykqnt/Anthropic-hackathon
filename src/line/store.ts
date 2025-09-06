export type ImageBlob = { data: Buffer; mimeType: string };

export interface ImageStore {
  set(userId: string, blob: ImageBlob): Promise<void>;
  get(userId: string): Promise<ImageBlob | undefined>;
}

export class InMemoryImageStore implements ImageStore {
  private map = new Map<string, { blob: ImageBlob; expiresAt: number }>();
  private ttlMs: number;

  constructor(opts?: { ttlMs?: number }) {
    this.ttlMs = opts?.ttlMs ?? 5 * 60 * 1000;
  }

  async set(userId: string, blob: ImageBlob) {
    const expiresAt = Date.now() + this.ttlMs;
    this.map.set(userId, { blob, expiresAt });
  }

  async get(userId: string) {
    const entry = this.map.get(userId);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(userId);
      return undefined;
    }
    return entry.blob;
  }
}

