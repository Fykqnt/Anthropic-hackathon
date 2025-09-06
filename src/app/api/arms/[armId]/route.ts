import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sbAdmin } from "@/lib/supabaseAdmin";

// PATCH /api/arms/[armId] - Update arm (activate/deactivate)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { armId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { active, notes } = await req.json();
    const { armId } = params;

    const updateData: any = {};
    if (typeof active === 'boolean') updateData.active = active;
    if (notes) updateData.notes = `${notes} (updated by ${userId} at ${new Date().toISOString()})`;

    const { data, error } = await sbAdmin
      .from("arms")
      .update(updateData)
      .eq("arm_id", armId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ arm: data });
  } catch (error) {
    console.error("Failed to update arm:", error);
    return NextResponse.json({ error: "Failed to update arm" }, { status: 500 });
  }
}

// GET /api/arms/[armId] - Get specific arm details
export async function GET(
  req: NextRequest,
  { params }: { params: { armId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { armId } = params;

    const { data, error } = await sbAdmin
      .from("arms")
      .select(`
        *,
        arm_stats (
          shows,
          thumbs_up,
          thumbs_down,
          ctr,
          wilson_lower,
          updated_at
        )
      `)
      .eq("arm_id", armId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ arm: data });
  } catch (error) {
    console.error("Failed to get arm:", error);
    return NextResponse.json({ error: "Failed to get arm" }, { status: 500 });
  }
}
