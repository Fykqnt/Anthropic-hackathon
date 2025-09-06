import Anthropic from "@anthropic-ai/sdk";
import { sbAdmin } from "./supabaseAdmin";
import { DiffSchema, type Diff } from "./prompt";

interface RecentSignal {
  procedure: string | null;
  intensities: Record<string, number> | null;
  rating: number;
  reason: string | null;
  created_at: string;
}

function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

async function fetchRecentSignals(armId: string, limit: number = 50): Promise<RecentSignal[]> {
  const { data } = await sbAdmin
    .from("generations")
    .select("procedure, intensities, created_at, feedback(rating, reason, created_at)")
    .eq("arm_id", armId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const signals: RecentSignal[] = [];
  for (const row of (data as any[] | null) || []) {
    const fb = (row as any).feedback?.[0];
    if (!fb) continue;
    signals.push({
      procedure: row.procedure ?? null,
      intensities: (row.intensities as any) ?? null,
      rating: fb.rating ?? 0,
      reason: fb.reason ?? null,
      created_at: fb.created_at ?? row.created_at,
    });
  }
  return signals;
}

function validateDiff(diff: Diff): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const result = DiffSchema.safeParse(diff);
  if (!result.success) {
    errors.push(...result.error.issues.map(i => i.message));
  }
  if ((diff.changes || []).length > 5) {
    errors.push("Too many changes in single diff (max 5)");
  }
  const prohibitedTerms = ["完璧", "絶対", "100%", "奇跡", "魔法"];
  for (const change of diff.changes || []) {
    if (prohibitedTerms.some(term => change.after.includes(term))) {
      errors.push(`Prohibited term in change: ${change.selector}`);
    }
  }
  if (diff.sampling) {
    const t = diff.sampling.temperature;
    const p = diff.sampling.top_p;
    if (typeof t === "number" && (t < 0.1 || t > 1.0)) {
      errors.push("Temperature must be between 0.1 and 1.0");
    }
    if (typeof p === "number" && (p < 0.1 || p > 1.0)) {
      errors.push("top_p must be between 0.1 and 1.0");
    }
  }
  return { valid: errors.length === 0, errors };
}

async function proposeDiffsWithClaude(signals: RecentSignal[], basePromptVersion: string): Promise<Diff[]> {
  const anthropic = getAnthropicClient();
  if (!anthropic) return [];

  const prompt = `あなたは美容AIのプロンプト改善エンジニアです。直近のユーザーフィードバック（特に低評価）を踏まえ、最小編集の差分(JSON)と sampling 推奨(temperature/top_p) を最大1案、出力ONLY JSONで返してください。禁止語は厳守してください。

ベースプロンプトのバージョン: ${basePromptVersion}
直近のシグナル(JSON): ${JSON.stringify(signals).slice(0, 6000)}

JSON出力フォーマット例:
{
  "changes": [
    { "selector": "guidance.nose.bridge", "op": "replace", "after": "…" }
  ],
  "sampling": { "temperature": 0.6, "top_p": 0.9 },
  "version_bump": "patch"
}

注意:
- 変更は最大5点まで。過度な改変は禁止。
- 医療広告法に反する誇大表現は使用しない（例: 完璧, 絶対, 100%, 奇跡, 魔法）。
- 必ず純粋なJSONオブジェクト(単一のDiff)のみを返す。`;

  const resp = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (resp as any).content?.[0]?.type === "text" ? (resp as any).content[0].text : String((resp as any).content);
  try {
    const parsed = JSON.parse(text as string);
    const one: Diff = Array.isArray(parsed) ? parsed[0] : parsed;
    return one ? [one] : [];
  } catch {
    return [];
  }
}

async function registerNewArm(diff: Diff, notes: string): Promise<string | null> {
  const sampling = diff.sampling || { temperature: 0.7, top_p: 0.9 };
  const { data, error } = await sbAdmin
    .from("arms")
    .insert({
      base_prompt_version: "v1",
      diff_json: diff,
      sampling_json: sampling,
      active: true,
      notes,
    })
    .select("arm_id")
    .single();

  if (error || !data) return null;

  await sbAdmin
    .from("arm_stats")
    .insert({ arm_id: data.arm_id, shows: 0, thumbs_up: 0, thumbs_down: 0 })
    .catch(() => {});

  return data.arm_id as string;
}

export async function optimizeArmOnline(armId: string): Promise<{ createdArmId: string | null; reason: string }>{
  // Gather recent signals for this arm
  const signals = await fetchRecentSignals(armId, 50);
  const negativeRate = signals.length > 0 ? signals.filter(s => s.rating === 0).length / signals.length : 0;

  // Throttle: only proceed if there is meaningful negative signal
  if (signals.length < 10 || negativeRate < 0.3) {
    return { createdArmId: null, reason: "Not enough negative signal to propose online diff" };
  }

  // Find arm to get base version
  const { data: arm } = await sbAdmin
    .from("arms")
    .select("base_prompt_version")
    .eq("arm_id", armId)
    .single();

  const baseVer = (arm as any)?.base_prompt_version || "v1";
  const diffs = await proposeDiffsWithClaude(signals, baseVer);
  if (diffs.length === 0) {
    return { createdArmId: null, reason: "Claude returned no diff" };
  }

  const diff = diffs[0];
  const validation = validateDiff(diff);
  if (!validation.valid) {
    return { createdArmId: null, reason: `Invalid diff: ${validation.errors.join("; ")}` };
  }

  const createdId = await registerNewArm(diff, `Online optimization derived from ${armId} at ${new Date().toISOString()}`);
  return { createdArmId: createdId, reason: createdId ? "Created and activated new arm" : "Failed to register arm" };
}


