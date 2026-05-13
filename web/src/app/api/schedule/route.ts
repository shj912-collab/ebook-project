import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * PRD §7 — GET /api/schedule?proId=&date=YYYY-MM-DD
 * 해당 일의 예약 목록. RLS로 조회 권한이 있는 행만 반환됩니다.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const proId = searchParams.get("proId");
    const date = searchParams.get("date");
    if (!proId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Query params proId and date (YYYY-MM-DD) are required." },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const startIso = dayStart.toISOString();
    const endIso = dayEnd.toISOString();

    const { data: schedules, error: schedErr } = await supabase
      .from("schedules")
      .select("*")
      .eq("pro_id", proId)
      .gte("start_time", startIso)
      .lt("start_time", endIso)
      .order("start_time", { ascending: true });

    if (schedErr) throw schedErr;

    return NextResponse.json({
      proId,
      date,
      schedules: schedules ?? [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
