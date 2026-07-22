import { NextResponse } from "next/server";
import {
  CUSTOMER_COLUMNS,
  AFTERCARE_COLUMNS,
  getSalonOwnerContext,
  isSalonCustomerStyleTarget,
  isSalonCustomerSource,
  normalizeAftercareTask,
  normalizeCustomer,
  parseNullableIso,
  runList,
  trimString,
} from "../../../../lib/salon-crm";
import { decodeListCursor, encodeListCursor } from "../../../../lib/list-cursor";

interface CreateCustomerRequest {
  source?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  memo?: unknown;
  consentSms?: unknown;
  consentKakao?: unknown;
  styleTarget?: unknown;
  nextFollowUpAt?: unknown;
}

function escapeSearchValue(value: string) {
  return value.replace(/[%,()]/g, "");
}

function parseLimit(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(100, Math.max(10, Math.floor(parsed)));
}

export async function GET(request: Request) {
  const context = await getSalonOwnerContext("read");
  if (!context.ok) {
    return context.response;
  }

  const url = new URL(request.url);
  const q = escapeSearchValue(trimString(url.searchParams.get("q"), 80));
  const source = url.searchParams.get("source");
  const aftercareStatus = url.searchParams.get("aftercareStatus");
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursorParam = url.searchParams.get("cursor");
  const cursor = decodeListCursor(cursorParam);
  if (cursorParam && !cursor) {
    return NextResponse.json({ error: "Invalid pagination cursor" }, { status: 400 });
  }

  try {
    let query = context.supabase
      .from("salon_customers")
      .select(CUSTOMER_COLUMNS, { count: "exact" })
      .eq("owner_user_id", context.userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.or(`updated_at.lt.${cursor.sortValue},and(updated_at.eq.${cursor.sortValue},id.lt.${cursor.id})`);
    }

    if (q) {
      query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
    }

    if (isSalonCustomerSource(source)) {
      query = query.eq("source", source);
    }

    const { data, error, count } = (await query) as unknown as {
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
      count: number | null;
    };
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    let customers = pageRows.map(normalizeCustomer);
    const lastRow = pageRows.at(-1);

    if (aftercareStatus === "pending") {
      const now = new Date().toISOString();
      customers = customers.filter((customer) => customer.nextFollowUpAt && customer.nextFollowUpAt >= now);
    }

    if (aftercareStatus === "overdue") {
      const now = new Date().toISOString();
      customers = customers.filter((customer) => customer.nextFollowUpAt && customer.nextFollowUpAt < now);
    }

    const { data: taskRows } = await runList<Record<string, unknown>>(
      context.supabase
        .from("salon_aftercare_tasks")
        .select(AFTERCARE_COLUMNS)
        .eq("owner_user_id", context.userId)
        .eq("status", "pending")
        .order("scheduled_for", { ascending: true })
        .limit(20),
    );

    const pendingAftercare = (taskRows || []).map(normalizeAftercareTask);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const todayIso = today.toISOString();

    return NextResponse.json(
      {
        customers,
        limit,
        total: count ?? customers.length,
        nextCursor:
          hasMore && lastRow
            ? encodeListCursor(String(lastRow.updated_at || ""), String(lastRow.id || ""))
            : null,
        summary: {
          totalCustomers: count ?? customers.length,
          linkedMembers: customers.filter((customer) => customer.isLinkedMember).length,
          pendingAftercare: pendingAftercare.length,
          dueToday: pendingAftercare.filter((task) => task.scheduledFor <= todayIso).length,
        },
        pendingAftercare,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await getSalonOwnerContext();
  if (!context.ok) {
    return context.response;
  }

  const body = (await request.json().catch(() => ({}))) as CreateCustomerRequest;
  const source = isSalonCustomerSource(body.source) ? body.source : "manual";
  const name = trimString(body.name, 120);
  const phone = trimString(body.phone, 40);
  const email = trimString(body.email, 160).toLowerCase();
  const memo = trimString(body.memo, 1200);
  const nextFollowUpAt = parseNullableIso(body.nextFollowUpAt);
  const styleTarget = isSalonCustomerStyleTarget(body.styleTarget) ? body.styleTarget : null;

  const customerName = name;
  const customerEmail = email;

  if (source === "linked_member") {
    return NextResponse.json({ error: "Use salon match requests to link members" }, { status: 400 });
  }

  if (!customerName) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("salon_customers")
    .insert({
      owner_user_id: context.userId,
      linked_user_id: null,
      source: "manual",
      name: customerName,
      phone: phone || null,
      email: customerEmail || null,
      memo: memo || null,
      consent_sms: body.consentSms === true,
      consent_kakao: body.consentKakao === true,
      style_target: styleTarget,
      next_follow_up_at: nextFollowUpAt,
    })
    .select(CUSTOMER_COLUMNS)
    .single<Record<string, unknown>>();

  if (error) {
    const isDuplicate = error.message.toLowerCase().includes("duplicate");
    return NextResponse.json(
      { error: isDuplicate ? "This member is already linked to your customer list" : error.message },
      { status: isDuplicate ? 409 : 500 },
    );
  }

  return NextResponse.json({ customer: data ? normalizeCustomer(data) : null }, { status: 201 });
}
