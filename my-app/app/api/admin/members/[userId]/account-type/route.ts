import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  adminActionErrorMessage,
  adminActionHttpStatus,
  isUuid,
  parseAdminActionResult,
  type AdminActionResult,
} from "../../../../../../lib/admin-action-receipt";
import { getAdminApiContext } from "../../../../../../lib/admin-auth";
import { isAccountType, trimText } from "../../../../../../lib/onboarding";
import { callSupabaseRpc } from "../../../../../../lib/supabase-rpc";

interface Params {
  params: Promise<{ userId: string }>;
}

interface AccountTypeRequestBody {
  actionKey?: unknown;
  expectedAccountType?: unknown;
  accountType?: unknown;
}

interface UpdatedMemberRow {
  id: string;
  email: string | null;
  display_name: string | null;
  account_type: string | null;
  credits: number | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

async function syncRoleMetadata(userId: string, accountType: string) {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      accountType,
      onboardingComplete: true,
    },
  });
}

function actionResponse(result: AdminActionResult, member?: UpdatedMemberRow | null) {
  const status = adminActionHttpStatus(result);
  return NextResponse.json(
    {
      ...result,
      member,
      metadataSynced: result.outcome === "succeeded",
      error: status >= 400 ? adminActionErrorMessage(result) : undefined,
    },
    { status },
  );
}

export async function PATCH(request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const resolvedParams = await params;
  const targetUserId = trimText(resolvedParams.userId, 160);
  if (!targetUserId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as AccountTypeRequestBody;
  const actionKey = isUuid(body.actionKey) ? body.actionKey : null;
  const expectedAccountType = isAccountType(body.expectedAccountType) ? body.expectedAccountType : null;
  const accountType = isAccountType(body.accountType) ? body.accountType : null;

  if (!actionKey) {
    return NextResponse.json({ error: "actionKey must be a UUID" }, { status: 400 });
  }
  if (!expectedAccountType || !accountType) {
    return NextResponse.json({ error: "accountType is invalid" }, { status: 400 });
  }

  const { data, error } = await callSupabaseRpc(context.supabase, "execute_admin_account_type_change", {
    p_action_key: actionKey,
    p_actor_user_id: context.userId,
    p_target_user_id: targetUserId,
    p_expected_account_type: expectedAccountType,
    p_target_account_type: accountType,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let result = parseAdminActionResult(data);
  if (!result) {
    return NextResponse.json({ error: "Invalid admin action receipt" }, { status: 500 });
  }

  if (result.outcome === "provider_pending") {
    try {
      await syncRoleMetadata(targetUserId, accountType);
      const finalized = await callSupabaseRpc(context.supabase, "finalize_admin_action_receipt", {
        p_action_key: actionKey,
        p_actor_user_id: context.userId,
        p_status: "succeeded",
        p_external_reference: null,
        p_error_code: null,
        p_error_message: null,
        p_after_state: { clerkMetadataSynced: true },
      });

      if (finalized.error) {
        return NextResponse.json(
          {
            ...result,
            error: "DB 권한은 변경되었지만 감사 영수증 최종화에 실패했습니다.",
          },
          { status: 202 },
        );
      }

      result = parseAdminActionResult(finalized.data) ?? result;
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Clerk metadata sync failed";
      console.error("[admin/members/account-type] Failed to sync Clerk metadata", syncError);

      const finalized = await callSupabaseRpc(context.supabase, "finalize_admin_action_receipt", {
        p_action_key: actionKey,
        p_actor_user_id: context.userId,
        p_status: "provider_pending",
        p_external_reference: null,
        p_error_code: "clerk_metadata_sync_pending",
        p_error_message: message,
        p_after_state: { clerkMetadataSynced: false },
      });

      result = parseAdminActionResult(finalized.data) ?? result;
      return NextResponse.json(
        {
          ...result,
          metadataSynced: false,
          error: "DB 권한은 변경되었지만 로그인 권한 동기화가 대기 중입니다. 같은 작업으로 다시 확인해 주세요.",
        },
        { status: 202 },
      );
    }
  }

  const { data: member, error: memberError } = await context.supabase
    .from("users")
    .select("id,email,display_name,account_type,credits,onboarding_completed_at,created_at,updated_at")
    .eq("id", targetUserId)
    .maybeSingle<UpdatedMemberRow>();

  if (memberError) {
    return NextResponse.json({ error: memberError.message, ...result }, { status: 500 });
  }

  return actionResponse(result, member);
}
