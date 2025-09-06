import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { processLineWebhook } from '../src/line/webhook';
import * as handler from '../src/line/handler';
import type { Deps, LineEvent } from '../src/line/types';

const secret = 'line_secret';

const baseDeps = (): Deps => ({
  replyMessage: vi.fn(async () => {}),
  pushMessage: vi.fn(async () => {}),
  getMessageContent: vi.fn(async () => ({ data: Buffer.from('img'), mimeType: 'image/png' })),
  editImageWithPrompt: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,AAA' })),
  store: { set: vi.fn(async () => {}), get: vi.fn(async () => undefined) },
});

describe('processLineWebhook', () => {
  let deps: Deps;
  beforeEach(() => { deps = baseDeps(); });

  it('rejects when signature is invalid', async () => {
    const body = JSON.stringify({ events: [] });
    const res = await processLineWebhook({
      bodyText: body,
      signature: 'bad',
      channelSecret: secret,
      deps,
    });
    expect(res.status).toBe(401);
  });

  it('accepts and dispatches events when signature is valid', async () => {
    const events: LineEvent[] = [
      { type: 'message', replyToken: 'r1', source: { type: 'user', userId: 'U' }, timestamp: 0, message: { id: 'm1', type: 'image' } } as any,
    ];
    const body = JSON.stringify({ events });
    const sig = createHmac('sha256', secret).update(body).digest('base64');

    const sp = vi.spyOn(handler, 'handleEvents').mockImplementation(async () => {});
    const res = await processLineWebhook({ bodyText: body, signature: sig, channelSecret: secret, deps });
    expect(res.status).toBe(200);
    expect(sp).toHaveBeenCalledTimes(1);
    sp.mockRestore();
  });
});
