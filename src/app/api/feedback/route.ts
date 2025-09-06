import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sbAdmin } from "@/lib/supabaseAdmin";
import { updateArmStats, checkGuardrails, deactivateArm } from "@/lib/bandit";
import { optimizeArmOnline } from "@/lib/onlineOptimizer";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { generationId, rating, reason } = await req.json();
  if (![0, 1].includes(rating)) return NextResponse.json({ error: "rating must be 0 or 1" }, { status: 400 });

  // Get generation with arm_id
  const { data: gen, error: ge } = await sbAdmin
    .from("generations")
    .select("generation_id, arm_id")
    .eq("generation_id", generationId)
    .single();
  if (ge || !gen) return NextResponse.json({ error: "generation not found" }, { status: 404 });

  // Insert feedback
  // eslint-disable-next-line no-console
  console.debug("/api/feedback inserting", { generationId, rating, hasReason: !!reason, userId });
  const { error } = await sbAdmin.from("feedback").insert({
    generation_id: generationId,
    rating,
    reason,
    clerk_user_id: userId,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("/api/feedback supabase insert error", { message: error.message, details: (error as any).details, hint: (error as any).hint });
    // Treat duplicate feedback for the same generation as idempotent success
    const msg = (error as any).message || "";
    const code = (error as any).code || "";
    if (msg.includes("duplicate key value") || code === "23505") {
      // If reason was provided this time, update the existing row's reason
      const cleanReason = typeof reason === 'string' ? reason.trim() : '';
      if (cleanReason.length > 0) {
        try {
          await sbAdmin
            .from("feedback")
            .update({ reason: cleanReason, clerk_user_id: userId })
            .eq("generation_id", generationId);
          return NextResponse.json({ ok: true, duplicate: true, updatedReason: true });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("/api/feedback duplicate update failed", e);
        }
      }
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ error: (error as any).message }, { status: 500 });
  }

  // Update arm statistics if arm_id exists
  if (gen.arm_id) {
    try {
      await updateArmStats(gen.arm_id, rating as 0 | 1);

      // Check guardrails after feedback
      const isHealthy = await checkGuardrails(gen.arm_id);
      if (!isHealthy) {
        await deactivateArm(gen.arm_id, "Performance degradation detected");
        console.warn(`Arm ${gen.arm_id} deactivated due to performance issues`);
      }
    } catch (statsError) {
      console.error("Failed to update arm stats:", statsError);
      // Don't fail the request, just log the error
    }

    // Fire-and-forget online optimization on downvote with throttling inside
    if (rating === 0) {
      try {
        // eslint-disable-next-line no-floating-promises
        optimizeArmOnline(gen.arm_id).then((res) => {
          // eslint-disable-next-line no-console
          console.debug("onlineOptimize result", { arm: gen.arm_id, ...res });
        }).catch((e) => {
          console.error("onlineOptimize failed", e);
        });
      } catch (e) {
        console.error("Failed to trigger online optimization", e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}


