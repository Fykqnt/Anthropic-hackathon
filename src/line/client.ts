import type { ImageBlob } from './store';

export function createLineClient(opts: { accessToken: string }) {
  const { accessToken } = opts;
  const baseHeaders = {
    Authorization: `Bearer ${accessToken}`,
  } as const;

  async function replyMessage(replyToken: string, payload: any): Promise<void> {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyToken, ...payload }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // swallow but log
      console.error('LINE replyMessage failed', res.status, text);
    }
  }

  async function getMessageContent(messageId: string): Promise<ImageBlob> {
    const url = `https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`;
    const res = await fetch(url, { headers: baseHeaders });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`getMessageContent failed: ${res.status} ${text}`);
    }
    const mimeType = res.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf, mimeType };
  }

  async function pushMessage(to: string, payload: any): Promise<void> {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, ...payload }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('LINE pushMessage failed', res.status, text);
    }
  }

  return { replyMessage, getMessageContent, pushMessage };
}
