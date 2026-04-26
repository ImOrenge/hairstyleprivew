import { NextResponse } from "next/server";
import {
  CUSTOMER_COLUMNS,
  AFTERCARE_COLUMNS,
  getSalonOwnerContext,
  isSalonCustomerSource,
  normalizeAftercareTask,
  normalizeCustomer,
  parseNullableIso,
  runList,
  trimString,
} from "../../../../lib/salon-crm";

interface CreateCustomerRequest {
  source?: unknown;
  linkedEmail?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  memo?: unknown;
  consentSms?: unknown;
  consentKakao?: unknown;
  nextFollowUpAt?: unknown;
}

function escapeSearchValue(value: string) {
  return value.replace(/[%,()]/g, "");
}

export async function GET(request: Request) {
  const context = await getSalonOwnerContext();
  if (!context.ok) {
    return context.response;
  }

  const url = new URL(request.url);
  const q = escapeSearchValue(trimString(url.searchParams.get("q"), 80));
  const source = url.searchParams.get("source");
  const aftercareStatus = url.searchParams.get("aftercareStatus");

  try {
    let query = context.supabase
      .from("salon_customers")
      .select(CUSTOMER_COLUMNS)
      .eq("owner_user_id", context.userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (q) {
      query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
    }

    if (isSalonCustomerSource(source)) {
      query = query.eq("source", source);
    }

    const { data, error } = await runList<Record<string, unknown>>(query);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let customers = (data || []).map(normalizeCustomer);

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
        summary: {
          totalCustomers: customers.length,
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
  const linkedEmail = trimString(body.linkedEmail, 160).toLowerCase();
  const name = trimString(body.name, 120);
  const phone = trimString(body.phone, 40);
  const email = trimString(body.email, 160).toLowerCase();
  const memo = trimString(body.memo, 1200);
  const nextFollowUpAt = parseNullableIso(body.nextFollowUpAt);

  let linkedUserId: string | null = null;
  let customerName = name;
  let customerEmail = email;

  if (source === "linked_member") {
    if (!linkedEmail) {
      return NextResponse.json({ error: "linkedEmail is required" }, { status: 400 });
    }

    const { data: linkedUser, error } = await context.supabase
      .from("users")
      .select("id,email,display_name")
      .eq("email", linkedEmail)
      .maybeSingle<{ id?: string; email?: string | null; display_name?: string | null }>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!linkedUser?.id) {
      return NextResponse.json({ error: "Linked member not found" }, { status: 404 });
    }

    linkedUserId = linkedUser.id;
    customerEmail = linkedUser.email || linkedEmail;
    customerName = customerName || linkedUser.display_name || customerEmail;
  }

  if (!customerName) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("salon_customers")
    .insert({
      owner_user_id: context.userId,
      linked_user_id: linkedUserId,
      source,
      name: customerName,
      phone: phone || null,
      email: customerEmail || null,
      memo: memo || null,
      consent_sms: body.consentSms === true,
      consent_kakao: body.consentKakao === true,
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
