import { verifyLineSignature } from './security';
import { handleEvents } from './handler';
import type { Deps, LineEvent } from './types';

export async function processLineWebhook(args: {
  bodyText: string;
  signature: string | null | undefined;
  channelSecret: string;
  deps: Deps;
}): Promise<{ status: number }> {
  const { bodyText, signature, channelSecret, deps } = args;
  const ok = verifyLineSignature(channelSecret, bodyText, signature);
  if (!ok) return { status: 401 };

  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    // Per LINE behavior, return 200 to avoid retries, but ignore malformed
    return { status: 200 };
  }

  const events: LineEvent[] = Array.isArray(parsed?.events) ? parsed.events : [];
  try {
    await handleEvents(events, deps);
  } catch {
    // Swallow errors to keep webhook 200
  }
  return { status: 200 };
}

