import { NextResponse } from "next/server";
import { drainRefundExecutions } from "../../../../../lib/refund-automation";
import { isSupabaseConfigured } from "../../../../../lib/supabase";

function authorized(request: Request) {
  const expected = process.env.PORTONE_REFUND_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && provided && expected === provided);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  const limit = typeof body.limit === "number" && Number.isInteger(body.limit) ? body.limit : 5;
  try {
    const results = await drainRefundExecutions(limit);
    return NextResponse.json({ processed: results.length, results }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "환불 실행기를 처리하지 못했습니다." },
      { status: 500 },
    );
  }
}
