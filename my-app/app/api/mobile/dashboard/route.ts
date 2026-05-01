import { NextResponse } from "next/server";
import { requireMobileService, type MobileServiceKey } from "../../../../lib/mobile-auth";

const SERVICE_KEYS = ["customer", "salon", "admin"] as const;

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

interface QuerySingleResult<T> {
  data: T | null;
  error: { message: string } | null;
}

interface QueryBuilder<T> extends PromiseLike<QueryResult<T>> {
  eq: (column: string, value: unknown) => QueryBuilder<T>;
  is: (column: string, value: unknown) => QueryBuilder<T>;
  gte: (column: string, value: string) => QueryBuilder<T>;
  lte: (column: string, value: string) => QueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => QueryBuilder<T>;
  limit: (count: number) => QueryBuilder<T>;
  maybeSingle: () => Promise<QuerySingleResult<T>>;
}

interface MobileDashboardSupabase {
  from: <T = Record<string, unknown>>(table: string) => {
    select: (columns: string) => QueryBuilder<T>;
  };
}

interface GenerationRow {
  id?: unknown;
  status?: unknown;
  prompt_used?: unknown;
  generated_image_path?: unknown;
  options?: unknown;
  created_at?: unknown;
}

interface PaymentRow {
  id?: unknown;
  status?: unknown;
  amount?: unknown;
  credits_to_grant?: unknown;
  paid_at?: unknown;
  created_at?: unknown;
}

interface CustomerRow {
  id?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  linked_user_id?: unknown;
  next_follow_up_at?: unknown;
  updated_at?: unknown;
}

interface AftercareRow {
  id?: unknown;
  scheduled_for?: unknown;
}

interface CreatedAtRow {
  created_at?: unknown;
}

interface RevenueRow extends CreatedAtRow {
  amount?: unknown;
}

interface StatusRow extends CreatedAtRow {
  status?: unknown;
}

function isService(value: string | null): value is MobileServiceKey {
  return SERVICE_KEYS.includes(value as MobileServiceKey);
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown) {
  const normalized = text(value).trim();
  return normalized || null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selectedVariantLabel(options: unknown) {
  const recommendationSet = isRecord(options) && isRecord(options.recommendationSet)
    ? options.recommendationSet
    : null;
  const variants = Array.isArray(recommendationSet?.variants) ? recommendationSet.variants : [];
  const selectedId = text(recommendationSet?.selectedVariantId);
  const selected = variants.find((item) => isRecord(item) && selectedId && item.id === selectedId);
  const fallback = variants.find((item) => isRecord(item));
  const variant = isRecord(selected) ? selected : isRecord(fallback) ? fallback : null;
  return nullableText(variant?.label);
}

function dateKey(value: string) {
  return value.slice(0, 10);
}

function buildDateKeys(days: number, end: Date) {
  const keys: string[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - index);
    keys.push(dateKey(date.toISOString()));
  }
  return keys;
}

async function loadCustomerDashboard(
  supabase: MobileDashboardSupabase,
  userId: string,
  bootstrap: { credits: number; planKey: string | null },
) {
  const [generationsRes, paymentsRes] = await Promise.all([
    supabase
      .from<GenerationRow>("generations")
      .select("id,status,prompt_used,generated_image_path,options,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from<PaymentRow>("payment_transactions")
      .select("id,status,amount,credits_to_grant,paid_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const error = generationsRes.error || paymentsRes.error;
  if (error) {
    throw new Error(error.message);
  }

  return {
    credits: bootstrap.credits,
    planKey: bootstrap.planKey,
    recentGenerations: (generationsRes.data || []).map((row) => ({
      id: text(row.id),
      status: text(row.status) || "unknown",
      promptUsed: nullableText(row.prompt_used),
      generatedImagePath: nullableText(row.generated_image_path),
      selectedVariantLabel: selectedVariantLabel(row.options),
      createdAt: text(row.created_at),
    })),
    recentPayments: (paymentsRes.data || []).map((row) => ({
      id: text(row.id),
      status: text(row.status) || "unknown",
      amountKrw: numberValue(row.amount),
      creditsToGrant: numberValue(row.credits_to_grant),
      paidAt: nullableText(row.paid_at),
      createdAt: text(row.created_at),
    })),
  };
}

async function loadSalonDashboard(supabase: MobileDashboardSupabase, userId: string) {
  const [customersRes, aftercareRes] = await Promise.all([
    supabase
      .from<CustomerRow>("salon_customers")
      .select("id,name,phone,email,linked_user_id,next_follow_up_at,updated_at")
      .eq("owner_user_id", userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from<AftercareRow>("salon_aftercare_tasks")
      .select("id,scheduled_for")
      .eq("owner_user_id", userId)
      .eq("status", "pending")
      .order("scheduled_for", { ascending: true })
      .limit(100),
  ]);

  const error = customersRes.error || aftercareRes.error;
  if (error) {
    throw new Error(error.message);
  }

  const customers = customersRes.data || [];
  const pendingAftercare = aftercareRes.data || [];
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const todayIso = endOfToday.toISOString();

  return {
    summary: {
      totalCustomers: customers.length,
      linkedMembers: customers.filter((row) => Boolean(row.linked_user_id)).length,
      pendingAftercare: pendingAftercare.length,
      dueToday: pendingAftercare.filter((row) => text(row.scheduled_for) <= todayIso).length,
    },
    recentCustomers: customers.slice(0, 8).map((row) => ({
      id: text(row.id),
      name: text(row.name) || "Untitled customer",
      phone: nullableText(row.phone),
      email: nullableText(row.email),
      nextFollowUpAt: nullableText(row.next_follow_up_at),
      updatedAt: text(row.updated_at),
    })),
  };
}

async function loadAdminDashboard(supabase: MobileDashboardSupabase) {
  const range = 30;
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (range - 1));
  start.setUTCHours(0, 0, 0, 0);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [usersRes, paymentsRes, generationsRes, reviewsRes, leadsRes] = await Promise.all([
    supabase.from<CreatedAtRow>("users").select("created_at").gte("created_at", startIso).lte("created_at", endIso),
    supabase
      .from<RevenueRow>("payment_transactions")
      .select("created_at,amount")
      .eq("status", "paid")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabase
      .from<StatusRow>("generations")
      .select("created_at,status")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabase
      .from<CreatedAtRow>("generation_reviews")
      .select("created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabase
      .from<CreatedAtRow>("b2b_leads")
      .select("created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);

  const error = usersRes.error || paymentsRes.error || generationsRes.error || reviewsRes.error || leadsRes.error;
  if (error) {
    throw new Error(error.message);
  }

  const users = usersRes.data || [];
  const payments = paymentsRes.data || [];
  const generations = generationsRes.data || [];
  const reviews = reviewsRes.data || [];
  const leads = leadsRes.data || [];
  const keys = buildDateKeys(range, end);
  const dailyMap = new Map(
    keys.map((key) => [
      key,
      {
        date: key,
        newUsers: 0,
        generationsCompleted: 0,
        paidOrders: 0,
        revenueKrw: 0,
      },
    ]),
  );

  for (const row of users) {
    const bucket = dailyMap.get(dateKey(text(row.created_at)));
    if (bucket) bucket.newUsers += 1;
  }

  for (const row of generations) {
    if (row.status !== "completed") continue;
    const bucket = dailyMap.get(dateKey(text(row.created_at)));
    if (bucket) bucket.generationsCompleted += 1;
  }

  for (const row of payments) {
    const bucket = dailyMap.get(dateKey(text(row.created_at)));
    if (bucket) {
      bucket.paidOrders += 1;
      bucket.revenueKrw += numberValue(row.amount);
    }
  }

  return {
    kpis: {
      newUsers: users.length,
      paidOrders: payments.length,
      revenueKrw: payments.reduce((sum, row) => sum + numberValue(row.amount), 0),
      generationsCompleted: generations.filter((row) => row.status === "completed").length,
      reviewsSubmitted: reviews.length,
      b2bLeads: leads.length,
    },
    daily: Array.from(dailyMap.values()),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedService = url.searchParams.get("service");
  const service: MobileServiceKey = isService(requestedService) ? requestedService : "customer";
  const context = await requireMobileService(service);

  if (!context.ok) {
    return context.response;
  }

  try {
    const supabase = context.supabase as unknown as MobileDashboardSupabase;
    const generatedAt = new Date().toISOString();

    if (service === "salon") {
      return NextResponse.json(
        { service, generatedAt, salon: await loadSalonDashboard(supabase, context.userId) },
        { status: 200 },
      );
    }

    if (service === "admin") {
      return NextResponse.json(
        { service, generatedAt, admin: await loadAdminDashboard(supabase) },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        service,
        generatedAt,
        customer: await loadCustomerDashboard(supabase, context.userId, context.bootstrap),
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
