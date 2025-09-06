import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { sbAdmin } from '../src/lib/supabaseAdmin';

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  console.log('Seeding 45 days of demo generations + feedback (increasing approval rate)...');

  // Find baseline arm (v1, empty diff)
  let { data: baseArm, error: armErr } = await sbAdmin
    .from('arms')
    .select('*')
    .eq('base_prompt_version', 'v1')
    .eq('diff_json', { changes: [] } as any)
    .limit(1)
    .single();

  if (armErr || !baseArm) {
    // Create baseline arm if missing
    const { data: created, error: createErr } = await sbAdmin
      .from('arms')
      .insert({
        base_prompt_version: 'v1',
        diff_json: { changes: [] },
        sampling_json: { temperature: 0.7, top_p: 0.9 },
        active: true,
        notes: 'Auto-created baseline by seed_history'
      })
      .select('*')
      .single();
    if (createErr || !created) throw new Error('Failed to create baseline arm');
    baseArm = created;
    // Initialize stats row (best-effort)
    {
      const { error: initErr } = await sbAdmin.from('arm_stats').insert({ arm_id: baseArm.arm_id, shows: 0, thumbs_up: 0, thumbs_down: 0 });
      if (initErr) {
        // ignore if already exists or table missing
      }
    }
  }

  // Create ~45 days of daily generations to drive the approval-rate chart
  const days = 45;
  const generationsToInsert = Array.from({ length: days }).map((_, idx) => {
    const day = new Date();
    day.setDate(day.getDate() - (days - 1 - idx));
    // Simulate some daily variability in intensities
    const intensities = {
      eyeSurgery: randInt(0, 10),
      fatInjection: randInt(0, 10),
      noseReshaping: randInt(0, 10),
      browLift: randInt(0, 10),
      facialContouring: randInt(0, 10),
      facelift: randInt(0, 10),
    };
    const sampling = baseArm.sampling_json || { temperature: 0.7, top_p: 0.9 };
    return {
      arm_id: baseArm.arm_id,
      prompt_version: baseArm.base_prompt_version,
      applied_diff_hash: 'baseline',
      sampling_temperature: sampling.temperature ?? null,
      top_p: sampling.top_p ?? null,
      model: 'demo-model',
      procedure: 'face',
      intensities,
      clerk_user_id: 'demo',
      offer_probability: 0.1,
      latency_ms: randInt(800, 2200),
      result_ok: Math.random() > 0.05,
      created_at: day.toISOString(),
    };
  });

  const { data: gens, error: genErr } = await sbAdmin
    .from('generations')
    .insert(generationsToInsert)
    .select('generation_id, arm_id');

  if (genErr) throw genErr;

  // Seed feedback with a steadily increasing approval rate over time
  // Start ~45% and grow to ~80% linearly across the window
  const feedbackRows = (gens || []).map((g, idx, arr) => {
    const t = arr.length <= 1 ? 1 : idx / (arr.length - 1);
    const targetRate = 0.45 + t * (0.80 - 0.45); // 45% -> 80%
    const rating = Math.random() < targetRate ? 1 : 0;
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - (arr.length - 1 - idx));
    return {
      generation_id: g.generation_id,
      rating,
      reason: rating === 0 && Math.random() < 0.5 ? 'デモ: 少し不自然でした' : null,
      clerk_user_id: 'demo',
      created_at: createdAt.toISOString(),
    };
  });

  if (feedbackRows.length) {
    const { error: fbErr } = await sbAdmin.from('feedback').insert(feedbackRows);
    if (fbErr) throw fbErr;
  }

  // Increment shows in arm_stats for each generation (best-effort)
  for (const _ of gens || []) {
    const { error: rpcErr } = await sbAdmin.rpc('increment_arm_shows', { target_arm_id: baseArm.arm_id });
    if (rpcErr) {
      // ignore
    }
  }

  console.log('Seed completed:', { generations: gens?.length || 0, feedback: feedbackRows.length });
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});


