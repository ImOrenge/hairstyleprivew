import { NextResponse } from "next/server";
import {
  adminActionErrorMessage,
  adminActionHttpStatus,
  isUuid,
  parseAdminActionResult,
} from "../../../../../../lib/admin-action-receipt";
import { getAdminApiContext } from "../../../../../../lib/admin-auth";
import { trimText } from "../../../../../../lib/onboarding";
import { callSupabaseRpc } from "../../../../../../lib/supabase-rpc";

interface Params {
  params: Promise<{ userId: string }>;
}

interface AdjustCreditsRequestBody {
  actionKey?: unknown;
  expectedBalance?: unknown;
  delta?: unknown;
  reason?: unknown;
}

function parseInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
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
  const actionKey = isUuid(body.actionKey) ? body.actionKey : null;
  const expectedBalance = parseInteger(body.expectedBalance);
  const delta = parseInteger(body.delta);
  const reason = trimText(body.reason, 240);

  if (!actionKey) {
    return NextResponse.json({ error: "actionKey must be a UUID" }, { status: 400 });
  }
  if (expectedBalance === null || expectedBalance < 0) {
    return NextResponse.json({ error: "expectedBalance must be a non-negative integer" }, { status: 400 });
  }
  if (delta === null || delta === 0) {
    return NextResponse.json({ error: "delta must be a non-zero integer" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const { data, error } = await callSupabaseRpc(context.supabase, "execute_admin_credit_adjustment", {
    p_action_key: actionKey,
    p_actor_user_id: context.userId,
    p_target_user_id: targetUserId,
    p_expected_balance: expectedBalance,
    p_delta: delta,
    p_reason: reason,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = parseAdminActionResult(data);
  if (!result) {
    return NextResponse.json({ error: "Invalid admin action receipt" }, { status: 500 });
  }

  const status = adminActionHttpStatus(result);
  return NextResponse.json(
    {
      ...result,
      error: status >= 400 ? adminActionErrorMessage(result) : undefined,
    },
    { status },
  );
}
