import type { Deps, LineEvent, TextMessage, ImageMessage } from './types';
import { buildTreatmentQuickReply, treatmentToPrompt, buildRatingQuickReply } from './templates';

function getUserId(ev: LineEvent): string | undefined {
  const src = (ev as any).source;
  return src?.userId;
}

export async function handleEvents(events: LineEvent[], deps: Deps): Promise<void> {
  for (const ev of events) {
    try {
      if (ev.type === 'message' && ev.message?.type === 'image') {
        const userId = getUserId(ev);
        if (!userId) continue;
        const content = await deps.getMessageContent(ev.message.id);
        await deps.store.set(userId, content);
        const msg: TextMessage = {
          type: 'text',
          text: '希望する施術を選択してください。これはイメージシミュレーションであり医療行為ではありません。',
          quickReply: buildTreatmentQuickReply(),
        };
        await deps.replyMessage(ev.replyToken, { messages: [msg] });
        continue;
      }

      if (ev.type === 'postback') {
        const userId = getUserId(ev);
        if (!userId) continue;
        let data: any = {};
        try { data = JSON.parse(ev.postback?.data ?? '{}'); } catch {}
        // Rating feedback flow
        const rating = typeof data?.r === 'string' ? data.r : undefined;
        if (rating === 'good' || rating === 'bad') {
          const msg: TextMessage = {
            type: 'text',
            text: rating === 'good' ? 'フィードバックありがとうございます！👍' : 'ご意見ありがとうございます。改善に活かします。',
          };
          await deps.replyMessage(ev.replyToken, { messages: [msg] });
          continue;
        }

        // Treatment selection flow
        const treatment = data?.t as string | undefined;
        const prompt = treatment ? treatmentToPrompt(treatment) : undefined;
        const blob = await deps.store.get(userId);
        if (prompt && blob) {
          // 1) immediate reply: generating
          const generating: TextMessage = {
            type: 'text',
            text: 'AIが画像を生成しています。少々お待ちください…',
          };
          await deps.replyMessage(ev.replyToken, { messages: [generating] });

          // 2) compute and push result
          const edited = await deps.editImageWithPrompt(blob, prompt);
          const url = deps.toPublicUrl ? await deps.toPublicUrl(edited.dataUrl) : edited.dataUrl;
          const img: ImageMessage = {
            type: 'image',
            originalContentUrl: url,
            previewImageUrl: url,
          } as any;
          const ask: TextMessage = {
            type: 'text',
            text: '結果はいかがでしたか？',
            quickReply: buildRatingQuickReply(),
          } as any;
          if (deps.pushMessage) {
            await deps.pushMessage(userId, { messages: [img, ask] });
          }
        } else {
          const msg: TextMessage = {
            type: 'text',
            text: '画像が見つからないか、施術が不明です。最初に写真を送信し、続いて施術を選択してください。',
          };
          await deps.replyMessage(ev.replyToken, { messages: [msg] });
        }
        continue;
      }

      // Fallback
      if ((ev as any).replyToken) {
        await deps.replyMessage((ev as any).replyToken, {
          messages: [{ type: 'text', text: '写真を送信すると施術候補を提案します。' }],
        });
      }
    } catch (e) {
      // Must reply 200 to LINE even on errors; notify user when possible
      if ((ev as any).replyToken) {
        await deps.replyMessage((ev as any).replyToken, {
          messages: [{ type: 'text', text: '処理中にエラーが発生しました。時間をおいて再度お試しください。' }],
        });
      }
      // swallow
    }
  }
}
