import { NextResponse } from "next/server";
import {
  CUSTOMER_COLUMNS,
  VISIT_COLUMNS,
  getSalonOwnerContext,
  loadOwnerCustomer,
  normalizeVisit,
  parseNullableIso,
  trimString,
} from "../../../../../../lib/salon-crm";

interface Params {
  params: Promise<{ id: string }>;
}

interface CreateVisitRequest {
  visitedAt?: unknown;
  serviceNote?: unknown;
  memo?: unknown;
  nextRecommendedVisitAt?: unknown;
  createAftercare?: unknown;
}

export async function POST(request: Request, { params }: Params) {
  const context = await getSalonOwnerContext();
  if (!context.ok) {
    return context.response;
  }

  const { id } = await params;
  const customerId = id?.trim();
  if (!customerId) {
    return NextResponse.json({ error: "customer id is required" }, { status: 400 });
  }

  const loaded = await loadOwnerCustomer(context.supabase, context.userId, customerId);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const body = (await request.json().catch(() => ({}))) as CreateVisitRequest;
  const visitedAt = parseNullableIso(body.visitedAt) || new Date().toISOString();
  const serviceNote = trimString(body.serviceNote, 1000);
  const memo = trimString(body.memo, 1200);
  const nextRecommendedVisitAt = parseNullableIso(body.nextRecommendedVisitAt);

  if (!serviceNote) {
    return NextResponse.json({ error: "serviceNote is required" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("salon_customer_visits")
    .insert({
      owner_user_id: context.userId,
      customer_id: customerId,
      visited_at: visitedAt,
      service_note: serviceNote,
      memo: memo || null,
      next_recommended_visit_at: nextRecommendedVisitAt,
    })
    .select(VISIT_COLUMNS)
    .single<Record<string, unknown>>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await context.supabase
    .from("salon_customers")
    .update({
      last_visit_at: visitedAt,
      next_follow_up_at: nextRecommendedVisitAt,
    })
    .eq("owner_user_id", context.userId)
    .eq("id", customerId)
    .select(CUSTOMER_COLUMNS)
    .single<Record<string, unknown>>();

  if (body.createAftercare === true && nextRecommendedVisitAt) {
    await context.supabase
      .from("salon_aftercare_tasks")
      .insert({
        owner_user_id: context.userId,
        customer_id: customerId,
        channel: "manual",
        status: "pending",
        scheduled_for: nextRecommendedVisitAt,
        note: "Follow up after the recent salon visit.",
      })
      .select("id")
      .single<Record<string, unknown>>();
  }

  return NextResponse.json({ visit: data ? normalizeVisit(data) : null }, { status: 201 });
}
