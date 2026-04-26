import { NextResponse } from "next/server";
import {
  AFTERCARE_COLUMNS,
  CUSTOMER_COLUMNS,
  VISIT_COLUMNS,
  getSalonOwnerContext,
  loadOwnerCustomer,
  normalizeAftercareTask,
  normalizeCustomer,
  normalizeVisit,
  parseNullableIso,
  runList,
  trimString,
} from "../../../../../lib/salon-crm";

interface Params {
  params: Promise<{ id: string }>;
}

interface PatchCustomerRequest {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  memo?: unknown;
  consentSms?: unknown;
  consentKakao?: unknown;
  nextFollowUpAt?: unknown;
  archived?: unknown;
}

export async function GET(_request: Request, { params }: Params) {
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

  const [visitsResult, aftercareResult] = await Promise.all([
    runList<Record<string, unknown>>(
      context.supabase
        .from("salon_customer_visits")
        .select(VISIT_COLUMNS)
        .eq("owner_user_id", context.userId)
        .eq("customer_id", customerId)
        .order("visited_at", { ascending: false })
        .limit(50),
    ),
    runList<Record<string, unknown>>(
      context.supabase
        .from("salon_aftercare_tasks")
        .select(AFTERCARE_COLUMNS)
        .eq("owner_user_id", context.userId)
        .eq("customer_id", customerId)
        .order("scheduled_for", { ascending: false })
        .limit(50),
    ),
  ]);

  if (visitsResult.error) {
    return NextResponse.json({ error: visitsResult.error.message }, { status: 500 });
  }

  if (aftercareResult.error) {
    return NextResponse.json({ error: aftercareResult.error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      customer: loaded.customer,
      visits: (visitsResult.data || []).map(normalizeVisit),
      aftercareTasks: (aftercareResult.data || []).map(normalizeAftercareTask),
    },
    { status: 200 },
  );
}

export async function PATCH(request: Request, { params }: Params) {
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

  const body = (await request.json().catch(() => ({}))) as PatchCustomerRequest;
  const updates: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const name = trimString(body.name, 120);
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    updates.name = name;
  }

  if (typeof body.phone === "string") {
    updates.phone = trimString(body.phone, 40) || null;
  }

  if (typeof body.email === "string") {
    updates.email = trimString(body.email, 160).toLowerCase() || null;
  }

  if (typeof body.memo === "string") {
    updates.memo = trimString(body.memo, 1200) || null;
  }

  if (typeof body.consentSms === "boolean") {
    updates.consent_sms = body.consentSms;
  }

  if (typeof body.consentKakao === "boolean") {
    updates.consent_kakao = body.consentKakao;
  }

  if (body.nextFollowUpAt !== undefined) {
    updates.next_follow_up_at = body.nextFollowUpAt ? parseNullableIso(body.nextFollowUpAt) : null;
  }

  if (body.archived === true) {
    updates.archived_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ customer: loaded.customer }, { status: 200 });
  }

  const { data, error } = await context.supabase
    .from("salon_customers")
    .update(updates)
    .eq("owner_user_id", context.userId)
    .eq("id", customerId)
    .select(CUSTOMER_COLUMNS)
    .single<Record<string, unknown>>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customer: data ? normalizeCustomer(data) : null }, { status: 200 });
}
