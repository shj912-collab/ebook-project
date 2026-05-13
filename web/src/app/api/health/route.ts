import { NextResponse } from "next/server";

/** 배포·헬스체크용 */
export async function GET() {
  return NextResponse.json({ ok: true, service: "golf-sync" });
}
