export type Treatment = {
  id: string;
  label: string;
  prompt: string;
};

export const TREATMENTS: Treatment[] = [
  {
    id: 'nose',
    label: '鼻整形',
    prompt:
      'Simulate cosmetic rhinoplasty: refine nasal bridge and tip, natural look, keep skin tone and lighting consistent.',
  },
  {
    id: 'double_eyelid',
    label: '二重まぶた',
    prompt:
      'Simulate double eyelid surgery: add natural crease, keep eye shape realistic, avoid makeup changes.',
  },
  {
    id: 'chin',
    label: '顎形成',
    prompt:
      'Simulate genioplasty: subtle chin augmentation for balanced facial proportions, realistic skin texture.',
  },
  {
    id: 'jawline',
    label: '輪郭(フェイスライン)',
    prompt:
      'Simulate jawline contouring: slightly slimmer lower face while preserving identity, no artifacts.',
  },
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

export function treatmentToPrompt(id: string): string | undefined {
  return TREATMENTS.find((t) => t.id === id)?.prompt;
}

