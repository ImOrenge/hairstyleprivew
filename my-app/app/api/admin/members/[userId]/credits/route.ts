import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../../lib/admin-auth";
import { trimText } from "../../../../../../lib/onboarding";

interface Params {
  params: Promise<{ userId: string }>;
}

interface AdjustCreditsRequestBody {
  delta?: unknown;
  reason?: unknown;
}

interface LedgerInsertResult {
  id: number;
  user_id: string;
  amount: number;
  balance_after: number;
  reason: string | null;
  created_at: string;
}

interface UserCreditRow {
  id: string;
  credits: number;
}

function parseDelta(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value === 0) {
    return null;
  }
  return value;
}

export async function POST(request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const resolvedParams = await params;
  const targetUserId = trimText(resolvedParams.userId, 160);
  if (!targetUserId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as AdjustCreditsRequestBody;
  const delta = parseDelta(body.delta);
  const reason = trimText(body.reason, 240);

  if (delta === null) {
    return NextResponse.json({ error: "delta must be a non-zero integer" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const { data: ledger, error: ledgerError } = await context.supabase
    .from("credit_ledger")
    .insert({
      user_id: targetUserId,
      entry_type: "adjustment",
      amount: delta,
      reason,
      metadata: {
        source: "admin_dashboard",
        adminUserId: context.userId,
      },
    })
    .select("id,user_id,amount,balance_after,reason,created_at")
    .maybeSingle<LedgerInsertResult>();

  if (ledgerError) {
    const message = ledgerError.message.toLowerCase();
    if (message.includes("insufficient credits")) {
      return NextResponse.json({ error: "Insufficient credits for this adjustment" }, { status: 409 });
    }
    return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }

  if (!ledger) {
    return NextResponse.json({ error: "Failed to write credit ledger entry" }, { status: 500 });
  }

  const { data: userRow, error: userError } = await context.supabase
    .from("users")
    .select("id,credits")
    .eq("id", targetUserId)
    .maybeSingle<UserCreditRow>();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      ledger,
      user: userRow,
    },
    { status: 200 },
  );
}
