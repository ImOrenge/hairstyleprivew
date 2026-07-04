import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isSelfServeBillingPlanKey, type SelfServeBillingPlanKey } from "../../../lib/billing-plan";
import { sendSubscriptionWaitlistConfirmationEmail } from "../../../lib/resend";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../lib/supabase";

interface WaitlistRequestBody {
  email?: unknown;
  planKey?: unknown;
  sourcePath?: unknown;
  useCase?: unknown;
}

interface WaitlistEntryRow {
  id: string;
  email: string;
  email_normalized: string;
  plan_key: SelfServeBillingPlanKey;
  status: "pending" | "notified" | "converted" | "dismissed";
  user_id: string | null;
  source_path: string | null;
  use_case: string | null;
  created_at: string;
  updated_at: string;
}

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeSourcePath(value: unknown) {
  const sourcePath = trimText(value, 500);
  if (!sourcePath || !sourcePath.startsWith("/") || sourcePath.startsWith("//")) {
    return null;
  }

  return sourcePath;
}

async function getOptionalUser() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { userId: null, email: null, displayName: null };
    }

    const user = await currentUser();
    return {
      userId,
      email:
        user?.primaryEmailAddress?.emailAddress?.trim() ||
        user?.emailAddresses?.[0]?.emailAddress?.trim() ||
        null,
      displayName:
        user?.fullName?.trim() ||
        user?.firstName?.trim() ||
        user?.username?.trim() ||
        null,
    };
  } catch {
    return { userId: null, email: null, displayName: null };
  }
}

function waitlistColumns() {
  return [
    "id",
    "email",
    "email_normalized",
    "plan_key",
    "status",
    "user_id",
    "source_path",
    "use_case",
    "created_at",
    "updated_at",
  ].join(",");
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as WaitlistRequestBody;
  const planKey = trimText(body.planKey, 40);
  if (!isSelfServeBillingPlanKey(planKey)) {
    return NextResponse.json({ error: "planKey must be basic, standard, or pro" }, { status: 400 });
  }

  const optionalUser = await getOptionalUser();
  const email = (trimText(body.email, 160) || optionalUser.email || "").toLowerCase();
  if (!email || !isEmail(email)) {
    return NextResponse.json({ error: "유효한 이메일을 입력해 주세요." }, { status: 400 });
  }

  const useCase = trimText(body.useCase, 500) || null;
  const sourcePath = normalizeSourcePath(body.sourcePath);
  const supabase = getSupabaseAdminClient();
  const columns = waitlistColumns();
  const { data: existing, error: existingError } = await supabase
    .from("subscription_waitlist_entries")
    .select("id,status")
    .eq("email_normalized", email)
    .eq("plan_key", planKey)
    .maybeSingle<{ id: string; status: WaitlistEntryRow["status"] }>();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const payload = {
    user_id: optionalUser.userId,
    email,
    email_normalized: email,
    plan_key: planKey,
    status: "pending",
    source_path: sourcePath,
    use_case: useCase,
    last_submitted_at: new Date().toISOString(),
    metadata: {
      userAgent: request.headers.get("user-agent") || null,
    },
  };

  const result = existing
    ? await supabase
        .from("subscription_waitlist_entries")
        .update(payload)
        .eq("id", existing.id)
        .select(columns)
        .maybeSingle<WaitlistEntryRow>()
    : await supabase
        .from("subscription_waitlist_entries")
        .insert(payload)
        .select(columns)
        .maybeSingle<WaitlistEntryRow>();

  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error?.message || "Waitlist submit failed" }, { status: 500 });
  }

  if (!existing || existing.status === "dismissed") {
    const emailResult = await sendSubscriptionWaitlistConfirmationEmail({
      to: email,
      displayName: optionalUser.displayName,
      planKey: planKey as SelfServeBillingPlanKey,
    });
    if (emailResult.error) {
      console.warn("[subscription-waitlist] Confirmation email skipped or failed", emailResult.error);
    }
  }

  return NextResponse.json(
    {
      entry: result.data,
      duplicate: Boolean(existing),
    },
    { status: existing ? 200 : 201 },
  );
}
