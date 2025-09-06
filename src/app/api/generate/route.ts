import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sbAdmin } from "@/lib/supabaseAdmin";
import { BasePrompt, applyDiff, buildPrompt, hashDiff } from "@/lib/prompt";
import { selectArm } from "@/lib/bandit";

async function generateSimulation({ prompt, model }: { prompt: string; model: string }) {
  // TODO: Wire to your actual generator. For now, return a stub.
  return { ok: true, data: {} } as const;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { procedure, intensities, model = "gemini-2.5-flash-image-preview" } = await req.json();

  try {
    // ε-greedy arm selection
    const epsilon = 0.2; // Start with 20% exploration
    // Mirror decay schedule for logging offer probability
    const currentEpsilon = Math.max(0.05, epsilon * Math.exp(-0.1 * Date.now() / (1000 * 60 * 60 * 24)));
    const selectedArmId = await selectArm(epsilon);

    // Get selected arm details
    const { data: armData, error: armError } = await sbAdmin
      .from("arms")
      .select("*")
      .eq("arm_id", selectedArmId)
      .single();

    if (armError || !armData) {
      return NextResponse.json({ error: "Selected arm not found" }, { status: 500 });
    }

    // Apply diff to base prompt
    const applied = applyDiff(BasePrompt, armData.diff_json);
    const prompt = buildPrompt(applied, { procedure, intensities });
    const diffHash = hashDiff(armData.diff_json);

    // Offer probability used for IPS/DR evaluation (store exploration rate)
    const offerProbability = currentEpsilon;

    const t0 = performance.now();
    const result = await generateSimulation({ 
      prompt, 
      model,
      ...armData.sampling_json // Apply sampling parameters
    });
    const latency_ms = Math.round(performance.now() - t0);

    // Record generation with arm info
    const { data, error } = await sbAdmin
      .from("generations")
      .insert({
        arm_id: selectedArmId,
        prompt_version: armData.base_prompt_version,
        applied_diff_hash: diffHash,
        sampling_temperature: armData.sampling_json?.temperature || null,
        top_p: armData.sampling_json?.top_p || null,
        model,
        procedure,
        intensities,
        clerk_user_id: userId,
        offer_probability: offerProbability,
        latency_ms,
        result_ok: !!result.ok,
      })
      .select("generation_id")
      .single();

    if (error) {
      // eslint-disable-next-line no-console
      console.error("/api/generate insert error", { message: error.message, details: (error as any).details, hint: (error as any).hint });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Increment shows count for selected arm
    await sbAdmin.rpc('increment_arm_shows', { target_arm_id: selectedArmId });

    // eslint-disable-next-line no-console
    console.debug("/api/generate created generation", { generationId: data.generation_id, arm: selectedArmId, offerProbability });
    return NextResponse.json({ generationId: data.generation_id, result });

  } catch (err) {
    console.error("Generate API error:", err);
    return NextResponse.json({ error: "Failed to generate" }, { status: 500 });
  }
}


