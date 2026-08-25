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

interface Params { params: Promise<{ userId: string }> }
interface Body {
  actionKey?: unknown;
  offeringKey?: unknown;
  expectedOfferingVersion?: unknown;
  reason?: unknown;
}

export async function POST(request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) return context.response;

  const targetUserId = trimText((await params).userId, 160);
  const body = (await request.json().catch(() => ({}))) as Body;
  const actionKey = isUuid(body.actionKey) ? body.actionKey : null;
  const offeringKey = trimText(body.offeringKey, 120);
  const expectedOfferingVersion = typeof body.expectedOfferingVersion === "number" && Number.isInteger(body.expectedOfferingVersion)
    ? body.expectedOfferingVersion
    : null;
  const reason = trimText(body.reason, 240);

  if (!targetUserId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (!actionKey) return NextResponse.json({ error: "actionKey must be a UUID" }, { status: 400 });
  if (!offeringKey.startsWith("full_style_")) return NextResponse.json({ error: "offeringKey must be a full_style offering" }, { status: 400 });
  if (!expectedOfferingVersion || expectedOfferingVersion < 1) return NextResponse.json({ error: "expectedOfferingVersion must be a positive integer" }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "reason is required" }, { status: 400 });

  const { data, error } = await callSupabaseRpc(context.supabase, "execute_admin_entitlement_grant_v2", {
    p_action_key: actionKey,
    p_actor_user_id: context.userId,
    p_target_user_id: targetUserId,
    p_offering_key: offeringKey,
    p_expected_offering_version: expectedOfferingVersion,
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
