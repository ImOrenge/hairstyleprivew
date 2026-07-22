import { NextResponse } from "next/server";
import { drainRefundNotifications } from "../../../../../../lib/refund-notifications";

function authorized(request: Request) {
  const expected = process.env.PORTONE_REFUND_WORKER_SECRET || process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && provided && provided === expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  const limit = typeof body.limit === "number" ? body.limit : 10;
  return NextResponse.json({ results: await drainRefundNotifications(limit) });
}
