import { NextResponse } from "next/server";
import { isSelfServeBillingPlanKey } from "../../../../lib/billing-plan";
import { getAdminApiContext } from "../../../../lib/admin-auth";

const WAITLIST_STATUSES = ["pending", "notified", "converted", "dismissed"] as const;

function normalizeStatus(value: string | null) {
  if (!value || value === "all") {
    return null;
  }

  return WAITLIST_STATUSES.includes(value as (typeof WAITLIST_STATUSES)[number]) ? value : null;
}

function normalizePlanKey(value: string | null) {
  if (!value || value === "all") {
    return null;
  }

  return isSelfServeBillingPlanKey(value) ? value : null;
}

export async function GET(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const { searchParams } = new URL(request.url);
  const status = normalizeStatus(searchParams.get("status"));
  const planKey = normalizePlanKey(searchParams.get("planKey"));
  const columns = [
    "id",
    "user_id",
    "email",
    "plan_key",
    "status",
    "source_path",
    "use_case",
    "last_submitted_at",
    "notified_at",
    "converted_at",
    "created_at",
    "updated_at",
  ].join(",");

  let query = context.supabase
    .from("subscription_waitlist_entries")
    .select(columns);

  if (status) {
    query = query.eq("status", status);
  }

  if (planKey) {
    query = query.eq("plan_key", planKey);
  }

  const { data, error } = await query
    .order("last_submitted_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] }, { status: 200 });
}
