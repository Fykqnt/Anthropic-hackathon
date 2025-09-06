import { NextResponse } from 'next/server';
import { processLineWebhook } from '../../../line/webhook';
import { createLineClient } from '../../../line/client';
import { InMemoryImageStore } from '../../../line/store';
import { editImageWithGemini } from '../../../line/edit';

export const runtime = 'nodejs';

const store = new InMemoryImageStore({ ttlMs: 5 * 60 * 1000 });

export async function POST(req: Request) {
  const signature = req.headers.get('x-line-signature');
  const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

  if (!channelSecret || !accessToken) {
    return NextResponse.json({ ok: false, error: 'LINE env vars missing' }, { status: 500 });
  }

  const bodyText = await req.text();

  const client = createLineClient({ accessToken });
  const res = await processLineWebhook({
    bodyText,
    signature,
    channelSecret,
    deps: {
      replyMessage: client.replyMessage,
      getMessageContent: client.getMessageContent,
      editImageWithPrompt: editImageWithGemini,
      store,
    },
  });

  // Always 200 to LINE except signature failure
  if (res.status === 401) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}

