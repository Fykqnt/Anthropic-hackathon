import { describe, it, expect } from 'vitest';
import { processLineWebhook } from '../../src/line/webhook';
import { signLineBody } from '../../src/line/security';
import { InMemoryImageStore } from '../../src/line/store';

type Call = any;

function makeDeps() {
  const calls: { reply: Call[]; push: Call[] } = { reply: [], push: [] };
  return {
    deps: {
      replyMessage: async (replyToken: string, payload: any) => {
        calls.reply.push({ replyToken, payload });
      },
      pushMessage: async (to: string, payload: any) => {
        calls.push.push({ to, payload });
      },
      getMessageContent: async (_id: string) => ({ data: Buffer.from('x'), mimeType: 'image/png' }),
      editImageWithPrompt: async () => ({ dataUrl: 'data:image/png;base64,AAA' }),
      store: new InMemoryImageStore({ ttlMs: 1000 }),
    },
    calls,
  } as const;
}

describe('LINE webhook minimal flow', () => {
  const secret = 'test_secret';

  it('returns 401 when signature invalid', async () => {
    const { deps, calls } = makeDeps();
    const body = JSON.stringify({ events: [] });
    const res = await processLineWebhook({ bodyText: body, signature: 'invalid', channelSecret: secret, deps });
    expect(res.status).toBe(401);
    expect(calls.reply.length).toBe(0);
  });

  it('replies guidance on follow event with valid signature', async () => {
    const { deps, calls } = makeDeps();
    const body = JSON.stringify({ events: [{ type: 'follow', replyToken: 'r1', source: { type: 'user', userId: 'U1' } }] });
    const sig = signLineBody(secret, body);
    const res = await processLineWebhook({ bodyText: body, signature: sig, channelSecret: secret, deps });
    expect(res.status).toBe(200);
    expect(calls.reply.length).toBe(1);
    const msg = calls.reply[0].payload?.messages?.[0]?.text as string;
    expect(msg).toContain('顔写真を貼ってください');
  });

  it('stores image and offers treatment quick reply on image message', async () => {
    const { deps, calls } = makeDeps();
    const body = JSON.stringify({
      events: [
        { type: 'message', replyToken: 'r2', source: { type: 'user', userId: 'U2' }, message: { id: 'm1', type: 'image' } },
      ],
    });
    const sig = signLineBody(secret, body);
    const res = await processLineWebhook({ bodyText: body, signature: sig, channelSecret: secret, deps });
    expect(res.status).toBe(200);
    expect(calls.reply.length).toBe(1);
    const payload = calls.reply[0].payload;
    expect(payload?.messages?.[0]?.quickReply?.items?.length ?? 0).toBeGreaterThan(0);
  });
});
