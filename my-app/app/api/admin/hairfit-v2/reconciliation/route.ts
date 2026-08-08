import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../lib/admin-auth";
import { reconcileEntitlementsV2 } from "../../../../../lib/v2/reconciliation-server";

export async function GET() {
  const context = await getAdminApiContext();
  if (!context.ok) return context.response;
  const { data, error } = await context.supabase
    .from("hairfit_v2_reconciliation_runs")
    .select("id,scope,status,checked_count,mismatch_count,mismatch_sample,started_at,finished_at")
    .order("started_at", { ascending: false })
    .limit(50);
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ runs: data ?? [] });
}

export async function POST(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) return context.response;
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  const limit = typeof body.limit === "number" ? body.limit : 100;
  try { return NextResponse.json(await reconcileEntitlementsV2({ limit }), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Reconciliation failed" }, { status: 500 }); }
}
