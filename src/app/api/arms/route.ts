import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sbAdmin } from "@/lib/supabaseAdmin";
import { getArmMetrics } from "@/lib/bandit";
import { DiffSchema } from "@/lib/prompt";

// GET /api/arms - Get arm statistics
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    // Debug: basic env sanity (redacted)
    try {
      const sbUrl = process.env.SUPABASE_URL || "";
      const host = sbUrl ? new URL(sbUrl).host : "";
      // eslint-disable-next-line no-console
      console.debug("/api/arms GET env", { hasUrl: !!sbUrl, urlHost: host, hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
    } catch {}

    const metrics = await getArmMetrics();
    return NextResponse.json({ arms: metrics });
  } catch (error) {
    // Surface common migration error clearly
    const msg = (error as { message?: string })?.message || "Failed to get arm metrics";
    const lower = msg.toLowerCase();
    if (lower.includes("arm_stats") || lower.includes("schema cache") || lower.includes("could not find the table")) {
      console.error("/api/arms GET missing arm_stats or schema not applied:", msg);
      return NextResponse.json({
        error: "arm_stats table not found in Supabase. Apply supabase/schema.sql to your project and retry.",
        hint: "Run the SQL migration in supabase/schema.sql on your Supabase instance, or verify SUPABASE_URL points to the correct project.",
      }, { status: 503 });
    }
    console.error("Failed to get arm metrics:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/arms - Create new arm
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { basePromptVersion, diffJson, samplingJson, notes } = await req.json();

    // Validate diff structure
    const validatedDiff = DiffSchema.safeParse(diffJson);
    if (!validatedDiff.success) {
      return NextResponse.json({ 
        error: "Invalid diff format", 
        details: validatedDiff.error.issues 
      }, { status: 400 });
    }

    // Create new arm (inactive by default)
    const { data: newArm, error } = await sbAdmin
      .from("arms")
      .insert({
        base_prompt_version: basePromptVersion || "v1",
        diff_json: diffJson,
        sampling_json: samplingJson || {},
        active: false, // Start inactive for safety
        notes: notes || `Created by ${userId} at ${new Date().toISOString()}`
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Initialize arm stats
    await sbAdmin
      .from("arm_stats")
      .insert({
        arm_id: newArm.arm_id,
        shows: 0,
        thumbs_up: 0,
        thumbs_down: 0
      });

    return NextResponse.json({ arm: newArm });
  } catch (error) {
    console.error("Failed to create arm:", error);
    return NextResponse.json({ error: "Failed to create arm" }, { status: 500 });
  }
}
