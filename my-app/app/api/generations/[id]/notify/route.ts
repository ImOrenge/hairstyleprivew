import { NextResponse } from "next/server";
import { sendGenerationCompletedEmail } from "../../../../../lib/resend";
import { getSiteUrl } from "../../../../../lib/site-url";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

const uuidV4LikeRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAuthorized(request: Request) {
  const expected = process.env.GENERATION_WORKFLOW_CALLBACK_SECRET?.trim();
  const supplied = request.headers.get("x-hairfit-generation-secret")?.trim();
  return Boolean(expected && supplied && expected === supplied);
}

function isDeliverableEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const email = value.trim().toLowerCase();
  return email.includes("@") && !email.endsWith("@placeholder.local");
}

function getVariantCounts(options: unknown) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return { completedCount: 0, failedCount: 0 };
  }
  const recommendationSet = (options as Record<string, unknown>).recommendationSet;
  if (!recommendationSet || typeof recommendationSet !== "object" || Array.isArray(recommendationSet)) {
    return { completedCount: 0, failedCount: 0 };
  }
  const variants = (recommendationSet as Record<string, unknown>).variants;
  if (!Array.isArray(variants)) {
    return { completedCount: 0, failedCount: 0 };
  }

  return variants.reduce(
    (counts, variant) => {
      if (!variant || typeof variant !== "object" || Array.isArray(variant)) return counts;
      const status = (variant as Record<string, unknown>).status;
      if (status === "completed") counts.completedCount += 1;
      if (status === "failed") counts.failedCount += 1;
      return counts;
    },
    { completedCount: 0, failedCount: 0 },
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown email error";
  }
}

export async function POST(request: Request, { params }: Params) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: generationId } = await params;
  if (!uuidV4LikeRegex.test(generationId)) {
    return NextResponse.json({ error: "generationId must be a valid UUID" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const claimCompletionNotification = supabase.rpc as unknown as (
    fn: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data: claimData, error: claimError } = await claimCompletionNotification(
    "claim_generation_completion_notification",
    { p_generation_id: generationId },
  );

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const claim = Array.isArray(claimData) && claimData[0] && typeof claimData[0] === "object"
    ? (claimData[0] as Record<string, unknown>)
    : null;
  const claimedUserId =
    claim && typeof claim === "object" && typeof claim.claimed_user_id === "string"
      ? claim.claimed_user_id
      : null;
  if (!claimedUserId) {
    const { data: notificationState, error: stateError } = await supabase
      .from("generations")
      .select("status,completion_notification_status")
      .eq("id", generationId)
      .maybeSingle();
    if (stateError) {
      return NextResponse.json({ error: stateError.message }, { status: 500 });
    }
    const notificationStatus = notificationState?.completion_notification_status;
    if (notificationStatus === "sent" || notificationStatus === "skipped") {
      return NextResponse.json({ generationId, notified: false, reason: notificationStatus });
    }
    return NextResponse.json(
      {
        error: "Completion notification could not be claimed",
        generationStatus: notificationState?.status ?? null,
        notificationStatus: notificationStatus ?? null,
      },
      { status: 503 },
    );
  }

  const [{ data: generation, error: generationError }, { data: user, error: userError }] =
    await Promise.all([
      supabase.from("generations").select("id,options").eq("id", generationId).single(),
      supabase.from("users").select("email,display_name").eq("id", claimedUserId).single(),
    ]);

  if (generationError || userError || !generation || !user) {
    const message = generationError?.message || userError?.message || "Notification data not found";
    await supabase
      .from("generations")
      .update({ completion_notification_status: "failed", completion_notification_error: message })
      .eq("id", generationId);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!isDeliverableEmail(user.email)) {
    const { error: skipUpdateError } = await supabase
      .from("generations")
      .update({
        completion_notification_status: "skipped",
        completion_notification_error: "No deliverable account email",
      })
      .eq("id", generationId);
    if (skipUpdateError) {
      return NextResponse.json({ error: skipUpdateError.message }, { status: 500 });
    }
    return NextResponse.json({ generationId, notified: false, reason: "email_unavailable" });
  }

  const { completedCount, failedCount } = getVariantCounts(generation.options);
  const resultUrl = new URL(`/generate/${generationId}`, getSiteUrl()).toString();
  const result = await sendGenerationCompletedEmail({
    to: user.email,
    displayName: typeof user.display_name === "string" ? user.display_name : null,
    generationId,
    completedCount,
    failedCount,
    resultUrl,
  });

  if (result.error) {
    const message = errorMessage(result.error);
    await supabase
      .from("generations")
      .update({ completion_notification_status: "failed", completion_notification_error: message })
      .eq("id", generationId);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const { error: sentUpdateError } = await supabase
    .from("generations")
    .update({
      completion_notification_status: "sent",
      completion_notification_sent_at: new Date().toISOString(),
      completion_notification_error: null,
    })
    .eq("id", generationId);

  if (sentUpdateError) {
    return NextResponse.json({ error: sentUpdateError.message }, { status: 500 });
  }

  return NextResponse.json({
    generationId,
    notified: true,
    providerMessageId: result.data?.id ?? null,
  });
}
