import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../lib/admin-auth";
import { reconcileCapabilityReceiptsV2, reconcileEntitlementsV2 } from "../../../../../lib/v2/reconciliation-server";

export async function GET() {
  const context = await getAdminApiContext();
  if (!context.ok) return context.response;
  const [runs, operations] = await Promise.all([
    context.supabase.from("hairfit_v2_reconciliation_runs")
      .select("id,scope,status,checked_count,mismatch_count,mismatch_sample,started_at,finished_at")
      .order("started_at", { ascending: false }).limit(50),
    context.supabase.rpc("consultation_operations_snapshot_v2", { p_since: "24 hours" }),
  ]);
  if (runs.error) return NextResponse.json({ error: runs.error.message }, { status: 500 });
  return NextResponse.json({ runs: runs.data ?? [], operations: operations.error ? null : operations.data, operationsErrorCode: operations.error?.code ?? null });
}

export async function POST(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) return context.response;
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown; scope?: unknown };
  const limit = typeof body.limit === "number" ? body.limit : 100;
  const scope = body.scope === "capability-receipts" ? "capability-receipts" : "entitlement";
  try { return NextResponse.json(scope === "capability-receipts" ? await reconcileCapabilityReceiptsV2({ limit }) : await reconcileEntitlementsV2({ limit }), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Reconciliation failed" }, { status: 500 }); }
}
