export interface SurgeryIntensity {
  eyeSurgery: number; // 眼瞼手術合計（重瞼＋下眼瞼形成/脱脂＋眼瞼下垂＋内/外眼角）
  fatInjection: number; // 脂肪注入（顔）
  noseReshaping: number; // 鼻形成（隆鼻＋その他）
  browLift: number; // 眉毛挙上（ブロー/眉下切開等）
  facialContouring: number; // 顔面輪郭形成（骨切り等）
  facelift: number; // フェイスリフト（切開系）
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

export function generateSurgeryPrompt(intensities: SurgeryIntensity): string {
  const activeOperations = surgeryOptions.filter(option => intensities[option.key] > 0);
  
  if (activeOperations.length === 0) {
    return "この画像の美容整形シミュレーションをします。変更なし（自然な状態を維持）";
  }

  let prompt = "この画像の美容整形シミュレーションをします。肌の状態を維持しながら以下の施術を適用してください：\n\n";
  
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

export function generateProfilePrompt(isAfter: boolean = false): string {
  const basePrompt = `この画像を横顔（プロフィール、サイドビュー）に変換してください。以下の条件を厳密に守ってください：

📐 構図とポーズ：
- 顔を左向き（画面右側を向く）の完全な横顔に変換
- 肩から上の構図で統一
- 頭の位置は画面中央、やや上寄り
- 首から肩のラインを自然に表示

😐 表情と角度：
- 表情は完全にニュートラル（無表情、口を閉じた状態）
- 目線は真っ直ぐ前方（横顔の向いている方向）
- あごの角度は自然な位置（上向きや下向きにしない）

🎨 背景と照明：
- 背景は完全に単色（白またはライトグレー）
- 照明は均等で柔らかく、強い影を作らない
- 髪の毛や輪郭がはっきりと見える明るさ

👤 特徴の維持：
- 髪型、髪の色、髪の長さを正確に維持
- 服装の色とスタイルを維持（見える部分のみ）`;

  if (isAfter) {
    return basePrompt + `
- 美容整形後の顔の特徴を正確に反映
- Before画像と同じ構図、角度、表情、背景を完全に一致させる

⚠️ 重要：Before画像との完全な一貫性を保ち、施術の違いのみが比較できるようにしてください。`;
  }

  return basePrompt + `
- 元の顔の特徴を正確に横顔で表現
- 自然で美しい横顔の構図を作成`;
}
