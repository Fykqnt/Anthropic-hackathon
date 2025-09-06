import { GoogleGenAI } from '@google/genai';
import type { ImageBlob } from './store';

export async function editImageWithGemini(blob: ImageBlob, prompt: string, opts?: { model?: string; apiKey?: string }) {
  const apiKey = opts?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) is not set');
  const model = opts?.model || 'gemini-2.5-flash-image-preview';

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: [
      { inlineData: { data: blob.data.toString('base64'), mimeType: blob.mimeType || 'image/png' } },
      { text: `Edit the provided image as follows: ${prompt}. Return only the edited image.` },
    ],
  });

  let data: string | undefined;
  for (const cand of response?.candidates ?? []) {
    const parts = (cand as any).content?.parts as any[] | undefined;
    for (const p of parts ?? []) {
      if (p?.inlineData?.data && typeof p.inlineData.data === 'string') {
        data = p.inlineData.data;
        const mime = p.inlineData.mimeType || blob.mimeType || 'image/png';
        return { dataUrl: `data:${mime};base64,${data}` };
      }
    }
  }
  throw new Error('No edited image returned from the model');
}

