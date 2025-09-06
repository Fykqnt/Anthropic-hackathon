// NOTE: prompt utilities live under lib/, not app/
import { generateSurgeryPrompt, defaultIntensities, type SurgeryIntensity } from '../lib/prompt';

export type Treatment = {
  id: string;
  label: string;
  // Static prompt text is not used anymore; we now derive from prompt.ts
  prompt?: string;
};

export const TREATMENTS: Treatment[] = [
  { id: 'nose', label: '鼻整形' },
  { id: 'double_eyelid', label: '二重まぶた' },
  { id: 'chin', label: '顎形成' },
  { id: 'jawline', label: '輪郭(フェイスライン)' },
];

export function buildTreatmentQuickReply() {
  return {
    items: TREATMENTS.map((t) => ({
      action: {
        type: 'postback',
        label: t.label,
        data: JSON.stringify({ t: t.id }),
        displayText: `施術: ${t.label}`,
      },
    })),
  } as const;
}

function intensitiesForTreatment(id: string): SurgeryIntensity | undefined {
  const base = { ...defaultIntensities };
  switch (id) {
    case 'nose':
      base.noseReshaping = 6; // 中～強めの自然な変化
      return base;
    case 'double_eyelid':
      base.eyeSurgery = 6;
      return base;
    case 'chin':
      base.facialContouring = 5; // 顎先中心の輪郭補正として表現
      return base;
    case 'jawline':
      base.facialContouring = 6; // 下顔面の輪郭形成をやや強めに
      return base;
    default:
      return undefined;
  }
}

export function treatmentToPrompt(id: string): string | undefined {
  const ints = intensitiesForTreatment(id);
  return ints ? generateSurgeryPrompt(ints) : undefined;
}

export function buildRatingQuickReply() {
  const items = [
    { key: 'good', label: 'Good 👍' },
    { key: 'bad', label: 'Bad 👎' },
  ].map((r) => ({
    action: {
      type: 'postback',
      label: r.label,
      data: JSON.stringify({ r: r.key }),
      displayText: `評価: ${r.label}`,
    },
  }));
  return { items } as const;
}
