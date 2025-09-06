import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sbAdmin } from "@/lib/supabaseAdmin";

type Point = {
  date: string;
  up: number;
  total: number;
  rate: number;
};

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const daysParam = url.searchParams.get("days");
    const days = Math.max(1, Math.min(365, Number(daysParam) || 30));

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await sbAdmin
      .from("feedback")
      .select("rating, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const bucket = new Map<string, { up: number; total: number }>();
    for (const row of data || []) {
      const d = new Date(row.created_at).toISOString().slice(0, 10); // YYYY-MM-DD
      const current = bucket.get(d) || { up: 0, total: 0 };
      current.total += 1;
      current.up += row.rating ? 1 : 0;
      bucket.set(d, current);
    }

    // Ensure continuous dates for nicer graphs
    const points: Point[] = [];
    const start = new Date(since.slice(0, 10));
    const today = new Date();
    for (
      let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
      d <= today;
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
    ) {
      const key = new Date(d).toISOString().slice(0, 10);
      const v = bucket.get(key) || { up: 0, total: 0 };
      const rate = v.total > 0 ? v.up / v.total : 0;
      points.push({ date: key, up: v.up, total: v.total, rate });
    }

    const summaryUp = (data || []).reduce((s, r) => s + (r.rating ? 1 : 0), 0);
    const summaryTotal = data?.length || 0;
    const summaryRate = summaryTotal > 0 ? summaryUp / summaryTotal : 0;

    return NextResponse.json({ points, summary: { up: summaryUp, total: summaryTotal, rate: summaryRate } });
  } catch (e) {
    const msg = (e as { message?: string })?.message || "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


