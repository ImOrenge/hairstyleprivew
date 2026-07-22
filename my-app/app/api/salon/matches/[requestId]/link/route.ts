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

  const email = typeof member.email === "string" ? member.email : "";
  const displayName = typeof member.display_name === "string" && member.display_name.trim()
    ? member.display_name.trim()
    : email || "HairFit member";

  const { data: linkedMatch, error: linkError } = await (context.supabase as unknown as {
    rpc: (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  }).rpc("link_salon_match_request", {
    p_request_id: matchRequestId,
    p_owner_user_id: context.userId,
    p_member_display_name: displayName,
    p_member_email: email,
  });

  if (linkError || !linkedMatch) {
    const message = linkError?.message || "Customer link failed";
    const isConflict = message.includes("CONSENT_REQUIRED") || message.includes("REVOKED") || message.toLowerCase().includes("duplicate");
    return NextResponse.json(
      { error: isConflict ? "회원의 현재 동의가 없거나 연결 상태가 변경되었습니다." : message },
      { status: isConflict ? 409 : 500 },
    );
  }

  const linkedCustomerId =
    typeof linkedMatch.linked_customer_id === "string" ? linkedMatch.linked_customer_id : "";
  if (!linkedCustomerId) {
    return NextResponse.json({ error: "Linked customer is missing" }, { status: 500 });
  }

  const { data: linkedCustomer, error: customerError } = await context.supabase
    .from("salon_customers")
    .select(CUSTOMER_COLUMNS)
    .eq("owner_user_id", context.userId)
    .eq("id", linkedCustomerId)
    .maybeSingle<Record<string, unknown>>();

  if (customerError || !linkedCustomer) {
    return NextResponse.json({ error: customerError?.message || "Linked customer not found" }, { status: 500 });
  }

  return NextResponse.json(
    {
      customer: normalizeCustomer(linkedCustomer),
      match: normalizeMatchCandidate(linkedMatch, member),
    },
    { status: 200, headers: { "Cache-Control": "private, no-store" } },
  );
}
