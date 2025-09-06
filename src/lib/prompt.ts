import { z } from "zod";

export const BasePrompt = {
  version: "v1",
  guidance: {
    nose: { bridge: "鼻筋は直線的に整える。" },
    skin: { texture: "毛穴を過度に消さず、自然な質感を保つ。" },
  },
} as const;

export const DiffSchema = z.object({
  changes: z.array(z.object({
    selector: z.string(),
    op: z.literal("replace"),
    before: z.string().optional(),
    after: z.string(),
    rationale: z.string().optional(),
  })).max(5),
  sampling: z.object({
    temperature: z.number().min(0).max(1).optional(),
    top_p: z.number().min(0).max(1).optional(),
  }).partial().optional(),
  version_bump: z.enum(["patch","minor","major"]).optional(),
});
export type Diff = z.infer<typeof DiffSchema>;

export function applyDiff(base: any, diff?: Diff): any {
  if (!diff || !diff.changes || diff.changes.length === 0) {
    return base;
  }

  let result = JSON.parse(JSON.stringify(base)); // deep clone

  for (const change of diff.changes) {
    if (change.op === "replace") {
      const path = change.selector.split('.');
      let current = result;
      
      // Navigate to parent object
      for (let i = 0; i < path.length - 1; i++) {
        if (!(path[i] in current)) {
          current[path[i]] = {};
        }
        current = current[path[i]];
      }
      
      // Apply the change
      const lastKey = path[path.length - 1];
      current[lastKey] = change.after;
    }
  }

  return result;
}

export function hashDiff(diff?: Diff): string {
  if (!diff || !diff.changes || diff.changes.length === 0) {
    return "baseline";
  }
  
  // Create a stable hash of the diff
  const diffStr = JSON.stringify(diff.changes.sort((a, b) => a.selector.localeCompare(b.selector)));
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < diffStr.length; i++) {
    const char = diffStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(16);
}

export function buildPrompt(applied: any, inputs: {procedure: string; intensities: Record<string, number>}) {
  return `# 美容整形シミュレーション指示
- 施術: ${inputs.procedure}
- 強度: ${JSON.stringify(inputs.intensities)}
- ガイダンス:
  - 鼻筋: ${applied.guidance.nose.bridge}
  - 肌質: ${applied.guidance.skin.texture}
- 注意: 不自然なアーチファクトを避け、骨格に沿った陰影を重視する。`;
}

// ===== UI prompt helpers migrated from src/app/prompt.ts =====
export interface SurgeryIntensity {
  eyeSurgery: number;
  fatInjection: number;
  noseReshaping: number;
  browLift: number;
  facialContouring: number;
  facelift: number;
}

export const surgeryOptions = [
  {
    key: 'eyeSurgery' as keyof SurgeryIntensity,
    label: '眼瞼手術合計',
    description: '（重瞼＋下眼瞼形成/脱脂＋眼瞼下垂＋内/外眼角）',
    icon: '👁️'
  },
  {
    key: 'fatInjection' as keyof SurgeryIntensity,
    label: '脂肪注入（顔）',
    description: '',
    icon: '💉'
  },
  {
    key: 'noseReshaping' as keyof SurgeryIntensity,
    label: '鼻形成',
    description: '（隆鼻＋その他）',
    icon: '👃'
  },
  {
    key: 'browLift' as keyof SurgeryIntensity,
    label: '眉毛挙上',
    description: '（ブロー/眉下切開等）',
    icon: '🤨'
  },
  {
    key: 'facialContouring' as keyof SurgeryIntensity,
    label: '顔面輪郭形成',
    description: '（骨切り等）',
    icon: '🦴'
  },
  {
    key: 'facelift' as keyof SurgeryIntensity,
    label: 'フェイスリフト',
    description: '（切開系）',
    icon: '✨'
  }
];

export const defaultIntensities: SurgeryIntensity = {
  eyeSurgery: 0,
  fatInjection: 0,
  noseReshaping: 0,
  browLift: 0,
  facialContouring: 0,
  facelift: 0
};

export const PROMPT_VERSION = "v1";

export function generateSurgeryPrompt(intensities: SurgeryIntensity): string {
  const activeOperations = surgeryOptions.filter(option => intensities[option.key] > 0);
  
  if (activeOperations.length === 0) {
    return "この画像の美容整形シミュレーションをします。変更なし（自然な状態を維持）";
  }

  let prompt = "この画像の美容整形シミュレーションをします。変更を行う箇所のみを変化させることに集中してください。肌質を変化させずに、以下の施術を適用してください：\n\n";
  
  activeOperations.forEach((option, index) => {
    const intensity = intensities[option.key];
    prompt += `${index + 1}. **${option.label}**${option.description} intensity: ${intensity}\n`;
  });

  // Add specific instructions based on intensity levels
  prompt += "\n施術の強度について：\n";
  prompt += "- 1-2: 非常に自然で微細な変化\n";
  prompt += "- 3-4: 軽度の変化、自然な範囲内\n";
  prompt += "- 5-6: 中程度の変化、明確だが自然\n";
  prompt += "- 7-8: 強めの変化、はっきりとした効果\n";
  prompt += "- 9-10: 最大限の変化、劇的な効果\n\n";
  
  prompt += "自然で美しい仕上がりを心がけ、各施術の強度に応じて適切に調整してください。";

  return prompt;
}

export function getIntensityLabel(intensity: number): string {
  if (intensity === 0) return "なし";
  if (intensity <= 2) return "微細";
  if (intensity <= 4) return "軽度";
  if (intensity <= 6) return "中程度";
  if (intensity <= 8) return "強め";
  return "最大";
}

export function getIntensityColor(intensity: number): string {
  if (intensity === 0) return "text-gray-400";
  if (intensity <= 2) return "text-blue-500";
  if (intensity <= 4) return "text-green-500";
  if (intensity <= 6) return "text-yellow-500";
  if (intensity <= 8) return "text-orange-500";
  return "text-red-500";
}
