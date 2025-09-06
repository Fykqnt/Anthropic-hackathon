import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleEvents } from '../src/line/handler';
import type { LineEvent, Deps } from '../src/line/types';

const baseDeps = (): Deps => ({
  replyMessage: vi.fn(async () => {}),
  getMessageContent: vi.fn(async () => ({ data: Buffer.from('img'), mimeType: 'image/png' })),
  editImageWithPrompt: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,AAA' })),
  store: {
    set: vi.fn(async () => {}),
    get: vi.fn(async () => undefined),
  },
});

describe('handleEvents', () => {
  let deps: Deps;
  beforeEach(() => { deps = baseDeps(); });

  it('image message -> replies with treatment quick reply', async () => {
    const events: LineEvent[] = [
      {
        type: 'message',
        replyToken: 'r1',
        source: { type: 'user', userId: 'U1' },
        timestamp: Date.now(),
        message: { id: 'm1', type: 'image' },
      } as any,
    ];
    await handleEvents(events, deps);
    expect(deps.getMessageContent).toHaveBeenCalledWith('m1');
    expect(deps.replyMessage).toHaveBeenCalled();
    const payload = (deps.replyMessage as any).mock.calls[0][1];
    expect(payload).toMatchObject({ messages: [ { quickReply: expect.any(Object) } ] });
  });

  it('postback with treatment -> generates edited image and replies', async () => {
    // Pre-store image for user
    (deps.store.get as any).mockResolvedValueOnce({ data: Buffer.from('img'), mimeType: 'image/png' });
    const events: LineEvent[] = [
      {
        type: 'postback',
        replyToken: 'r2',
        source: { type: 'user', userId: 'U1' },
        timestamp: Date.now(),
        postback: { data: JSON.stringify({ t: 'nose' }) },
      } as any,
    ];
    await handleEvents(events, deps);
    expect(deps.editImageWithPrompt).toHaveBeenCalled();
    expect(deps.replyMessage).toHaveBeenCalled();
    const payload = (deps.replyMessage as any).mock.calls[0][1];
    expect(payload).toMatchObject({ messages: [ { type: 'image' } ] });
  });
});

