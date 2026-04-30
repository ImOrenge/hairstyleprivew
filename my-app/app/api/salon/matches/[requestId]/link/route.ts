import { NextResponse } from "next/server";
import {
  CUSTOMER_COLUMNS,
  LINKED_MEMBER_COLUMNS,
  MATCH_REQUEST_COLUMNS,
  getSalonOwnerContext,
  normalizeCustomer,
  normalizeMatchCandidate,
} from "../../../../../../lib/salon-crm";

interface Params {
  params: Promise<{ requestId: string }>;
}

export async function POST(_request: Request, { params }: Params) {
  const context = await getSalonOwnerContext();
  if (!context.ok) {
    return context.response;
  }

  const { requestId } = await params;
  const matchRequestId = requestId?.trim();
  if (!matchRequestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const { data: matchRequest, error: matchError } = await context.supabase
    .from("salon_match_requests")
    .select(MATCH_REQUEST_COLUMNS)
    .eq("id", matchRequestId)
    .eq("owner_user_id", context.userId)
    .maybeSingle<Record<string, unknown>>();

  if (matchError) {
    return NextResponse.json({ error: matchError.message }, { status: 500 });
  }

  if (!matchRequest) {
    return NextResponse.json({ error: "Match request not found" }, { status: 404 });
  }

  const memberUserId = typeof matchRequest.member_user_id === "string" ? matchRequest.member_user_id : "";
  if (!memberUserId) {
    return NextResponse.json({ error: "Member user is missing" }, { status: 400 });
  }

  if (matchRequest.status === "revoked") {
    return NextResponse.json({ error: "Match request was revoked" }, { status: 409 });
  }

  const { data: member, error: memberError } = await context.supabase
    .from("users")
    .select(LINKED_MEMBER_COLUMNS)
    .eq("id", memberUserId)
    .maybeSingle<Record<string, unknown>>();

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const { data: existingCustomer, error: existingError } = await context.supabase
    .from("salon_customers")
    .select(CUSTOMER_COLUMNS)
    .eq("owner_user_id", context.userId)
    .eq("linked_user_id", memberUserId)
    .is("archived_at", null)
    .maybeSingle<Record<string, unknown>>();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existingCustomer) {
    await context.supabase
      .from("salon_match_requests")
      .update({
        status: "linked",
        linked_customer_id: existingCustomer.id,
      })
      .eq("id", matchRequestId);

    return NextResponse.json(
      {
        customer: normalizeCustomer(existingCustomer),
        match: normalizeMatchCandidate(
          { ...matchRequest, status: "linked", linked_customer_id: existingCustomer.id },
          member,
        ),
      },
      { status: 200 },
    );
  }

  const email = typeof member.email === "string" ? member.email : "";
  const displayName = typeof member.display_name === "string" && member.display_name.trim()
    ? member.display_name.trim()
    : email || "HairFit member";

  const { data: createdCustomer, error: createError } = await context.supabase
    .from("salon_customers")
    .insert({
      owner_user_id: context.userId,
      linked_user_id: memberUserId,
      source: "linked_member",
      name: displayName.slice(0, 120),
      phone: null,
      email: email || null,
      memo: null,
      consent_sms: false,
      consent_kakao: false,
    })
    .select(CUSTOMER_COLUMNS)
    .single<Record<string, unknown>>();

  if (createError || !createdCustomer) {
    const isDuplicate = createError?.message.toLowerCase().includes("duplicate");
    return NextResponse.json(
      { error: isDuplicate ? "This member is already linked to your customer list" : createError?.message || "Customer creation failed" },
      { status: isDuplicate ? 409 : 500 },
    );
  }

  await context.supabase
    .from("salon_match_requests")
    .update({
      status: "linked",
      linked_customer_id: createdCustomer.id,
    })
    .eq("id", matchRequestId);

  return NextResponse.json(
    {
      customer: normalizeCustomer(createdCustomer),
      match: normalizeMatchCandidate(
        { ...matchRequest, status: "linked", linked_customer_id: createdCustomer.id },
        member,
      ),
    },
    { status: 201 },
  );
}
