import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../../lib/admin-auth";
import { isAccountType, trimText } from "../../../../../../lib/onboarding";

interface Params {
  params: Promise<{ userId: string }>;
}

interface AccountTypeRequestBody {
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
  const accountType = isAccountType(body.accountType) ? body.accountType : null;
  if (!accountType) {
    return NextResponse.json({ error: "accountType is invalid" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    account_type: accountType,
  };
  if (accountType === "admin") {
    updates.onboarding_completed_at = new Date().toISOString();
  }

  const { data, error } = await context.supabase
    .from("users")
    .update(updates)
    .eq("id", targetUserId)
    .select("id,email,display_name,account_type,credits,onboarding_completed_at,created_at,updated_at")
    .maybeSingle<UpdatedMemberRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  let metadataSynced = true;
  try {
    await syncRoleMetadata(targetUserId, accountType);
  } catch (syncError) {
    metadataSynced = false;
    console.error("[admin/members/account-type] Failed to sync Clerk metadata", syncError);
  }

  return NextResponse.json(
    {
      member: data,
      metadataSynced,
    },
    { status: 200 },
  );
}
