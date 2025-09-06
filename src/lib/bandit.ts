import { sbAdmin } from "./supabaseAdmin";

export interface Arm {
  arm_id: string;
  base_prompt_version: string;
  diff_json: any;
  sampling_json: any;
  active: boolean;
  created_at: string;
}

export interface ArmStats {
  arm_id: string;
  shows: number;
  thumbs_up: number;
  thumbs_down: number;
  ctr: number;
  wilson_lower?: number;
  updated_at: string;
}

// Wilson confidence interval calculation
export function calculateWilsonLower(successes: number, trials: number, confidence = 0.95): number {
  if (trials === 0) return 0;
  
  const z = 1.96; // 95% confidence
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = p + (z * z) / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * trials)) / trials);
  
  return Math.max(0, (center - margin) / denominator);
}

// ε-greedy arm selection
export async function selectArm(epsilon: number, minExposureRate: number = 0.05): Promise<string> {
  // Get active arms with stats
  const { data: armsWithStats, error } = await sbAdmin
    .from("arms")
    .select(`
      arm_id,
      base_prompt_version,
      diff_json,
      sampling_json,
      active,
      created_at,
      arm_stats (
        shows,
        thumbs_up,
        thumbs_down,
        ctr,
        wilson_lower
      )
    `)
    .eq("active", true);

  if (error || !armsWithStats || armsWithStats.length === 0) {
    try {
      // eslint-disable-next-line no-console
      console.debug("selectArm: query result", {
        error: error?.message,
        count: armsWithStats?.length || 0,
        arms: (armsWithStats || []).map((a: any) => ({ id: a.arm_id, shows: a.arm_stats?.[0]?.shows || 0 })),
        host: process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).host : "missing SUPABASE_URL",
      });
    } catch {}
    throw new Error("No active arms found");
  }

  // Calculate epsilon schedule (decay over time)
  const currentEpsilon = Math.max(0.05, epsilon * Math.exp(-0.1 * Date.now() / (1000 * 60 * 60 * 24))); // decay daily

  // Exploration vs exploitation
  if (Math.random() < currentEpsilon) {
    // Exploration: prioritize arms with fewer shows
    const armsByShows = armsWithStats.sort((a, b) => {
      const aShows = a.arm_stats?.[0]?.shows || 0;
      const bShows = b.arm_stats?.[0]?.shows || 0;
      return aShows - bShows;
    });
    return armsByShows[0].arm_id;
  } else {
    // Exploitation: select arm with highest CTR
    let bestArm = armsWithStats[0];
    let bestCtr = bestArm.arm_stats?.[0]?.ctr || 0;

    for (const arm of armsWithStats) {
      const ctr = arm.arm_stats?.[0]?.ctr || 0;
      if (ctr > bestCtr) {
        bestCtr = ctr;
        bestArm = arm;
      }
    }
    return bestArm.arm_id;
  }
}

// Update arm statistics after feedback
export async function updateArmStats(armId: string, rating: 0 | 1): Promise<void> {
  // Then update thumbs based on rating
  if (rating === 1) {
    await sbAdmin.rpc('increment_arm_thumbs_up', { target_arm_id: armId });
  } else {
    await sbAdmin.rpc('increment_arm_thumbs_down', { target_arm_id: armId });
  }

  // Recalculate Wilson confidence interval
  const { data: stats } = await sbAdmin
    .from("arm_stats")
    .select("shows, thumbs_up, thumbs_down")
    .eq("arm_id", armId)
    .single();

  if (stats) {
    const wilsonLower = calculateWilsonLower(stats.thumbs_up, stats.shows);
    await sbAdmin
      .from("arm_stats")
      .update({ 
        wilson_lower: wilsonLower,
        updated_at: new Date().toISOString()
      })
      .eq("arm_id", armId);
  }
}

// Guardrail: check if arm performance is degrading
export async function checkGuardrails(armId: string, windowSize: number = 50): Promise<boolean> {
  // Get recent generation ids for this arm
  const { data: gens } = await sbAdmin
    .from("generations")
    .select("generation_id")
    .eq("arm_id", armId)
    .order("created_at", { ascending: false })
    .limit(windowSize);

  const genIds = (gens || []).map((g: { generation_id: string }) => g.generation_id);
  if (genIds.length === 0) return true;

  // Get feedback for those generations
  const { data: recentFeedback } = await sbAdmin
    .from("feedback")
    .select("rating, created_at")
    .in("generation_id", genIds)
    .order("created_at", { ascending: false });

  if (!recentFeedback || recentFeedback.length < 20) {
    return true; // Not enough data, don't trigger guardrail
  }

  const recentApprovalRate = recentFeedback.reduce((sum, f) => sum + f.rating, 0) / recentFeedback.length;
  
  // Baseline: use the most exposed arm's ctr
  const { data: baselineList } = await sbAdmin
    .from("arm_stats")
    .select("ctr, shows")
    .order("shows", { ascending: false })
    .limit(1);
  const baselineRate = baselineList?.[0]?.ctr ?? 0.5;
  const threshold = baselineRate - 0.1; // 10% degradation threshold

  return recentApprovalRate >= threshold;
}

// Deactivate underperforming arm
export async function deactivateArm(armId: string, reason: string): Promise<void> {
  await sbAdmin
    .from("arms")
    .update({ 
      active: false,
      notes: `Deactivated: ${reason} at ${new Date().toISOString()}`
    })
    .eq("arm_id", armId);
}

// Get arm performance metrics
export async function getArmMetrics(): Promise<ArmStats[]> {
  const { data, error } = await sbAdmin
    .from("arm_stats")
    .select(`
      arm_id,
      shows,
      thumbs_up,
      thumbs_down,
      ctr,
      wilson_lower,
      updated_at,
      arms!inner(base_prompt_version, active, created_at)
    `)
    .order("ctr", { ascending: false });

  if (error) {
    // Fallback: if arm_stats is missing, return arms with zeroed stats so UI can render
    const { data: armsOnly } = await sbAdmin
      .from("arms")
      .select("arm_id, base_prompt_version, active, created_at")
      .eq("active", true);
    return (armsOnly || []).map((a: any) => ({
      arm_id: a.arm_id,
      shows: 0,
      thumbs_up: 0,
      thumbs_down: 0,
      ctr: 0,
      wilson_lower: 0,
      updated_at: new Date().toISOString(),
      arms: {
        base_prompt_version: a.base_prompt_version,
        active: a.active,
        created_at: a.created_at,
      },
    }));
  }
  return data || [];
}
