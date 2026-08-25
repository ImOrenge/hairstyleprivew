import { NextResponse } from "next/server";
import {
  adminActionErrorMessage,
  adminActionHttpStatus,
  isUuid,
  parseAdminActionResult,
} from "../../../../../../../../lib/admin-action-receipt";
import { getAdminApiContext } from "../../../../../../../../lib/admin-auth";
import { trimText } from "../../../../../../../../lib/onboarding";
import { callSupabaseRpc } from "../../../../../../../../lib/supabase-rpc";

interface Params { params: Promise<{ userId: string; grantId: string }> }
interface Body {
  actionKey?: unknown;
  expectedStatus?: unknown;
  expectedQuantityConsumed?: unknown;
  reason?: unknown;
}

export async function POST(request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) return context.response;

  const resolved = await params;
  const targetUserId = trimText(resolved.userId, 160);
  const grantId = isUuid(resolved.grantId) ? resolved.grantId : null;
  const body = (await request.json().catch(() => ({}))) as Body;
  const actionKey = isUuid(body.actionKey) ? body.actionKey : null;
  const expectedStatus = body.expectedStatus === "active" ? "active" : null;
  const expectedQuantityConsumed = typeof body.expectedQuantityConsumed === "number" && Number.isInteger(body.expectedQuantityConsumed)
    ? body.expectedQuantityConsumed
    : null;
  const reason = trimText(body.reason, 240);

  if (!targetUserId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (!grantId) return NextResponse.json({ error: "grantId must be a UUID" }, { status: 400 });
  if (!actionKey) return NextResponse.json({ error: "actionKey must be a UUID" }, { status: 400 });
  if (!expectedStatus) return NextResponse.json({ error: "expectedStatus must be active" }, { status: 400 });
  if (expectedQuantityConsumed !== 0) return NextResponse.json({ error: "expectedQuantityConsumed must be zero" }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "reason is required" }, { status: 400 });

  const { data, error } = await callSupabaseRpc(context.supabase, "execute_admin_entitlement_revoke_v2", {
    p_action_key: actionKey,
    p_actor_user_id: context.userId,
    p_target_user_id: targetUserId,
    p_grant_id: grantId,
    p_expected_status: expectedStatus,
    p_expected_quantity_consumed: expectedQuantityConsumed,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = parseAdminActionResult(data);
  if (!result) return NextResponse.json({ error: "Invalid admin action receipt" }, { status: 500 });
  const status = adminActionHttpStatus(result);
  return NextResponse.json({
    ...result,
    error: status >= 400 ? adminActionErrorMessage(result) : undefined,
  }, { status });
}
