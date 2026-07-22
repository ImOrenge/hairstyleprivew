import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/supabase";
import { getStylingCompletionNotificationState } from "../../../../lib/styling-notification-outbox";
import {
  STYLING_RESULTS_BUCKET,
  createSignedUrl,
  type ServerSupabaseLike,
} from "../../../../lib/style-profile-server";

interface Params {
  params: Promise<{ id: string }>;
}

interface StylingReceiptRpcClient {
  rpc: (
    fn: "read_styling_credit_receipt",
    params: { p_styling_session_id: string; p_user_id: string },
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "패션 추천 세션 정보가 필요합니다." }, { status: 400 });
  }

  const adminSupabase = getSupabaseAdminClient();
  const supabase = adminSupabase as unknown as ServerSupabaseLike;
  const { data, error } = await supabase
    .from("styling_sessions")
    .select("*")
    .eq("id", id.trim())
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "패션 추천 세션을 찾을 수 없습니다." }, { status: 404 });
  }
  if (data.user_id !== userId) {
    return NextResponse.json({ error: "이 추천 세션에 접근할 수 없습니다." }, { status: 403 });
  }

  const generatedImagePath =
    typeof data.generated_image_path === "string" ? data.generated_image_path : null;
  const [imageUrl, receiptResult, attemptResult, notificationState] = await Promise.all([
    createSignedUrl(supabase, STYLING_RESULTS_BUCKET, generatedImagePath),
    (supabase as unknown as StylingReceiptRpcClient).rpc("read_styling_credit_receipt", {
      p_styling_session_id: id.trim(),
      p_user_id: userId,
    }),
    adminSupabase
      .from("styling_credit_attempts")
      .select("state,lease_expires_at")
      .eq("styling_session_id", id.trim())
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getStylingCompletionNotificationState(id.trim()),
  ]);
  if (receiptResult.error) {
    return NextResponse.json({ error: receiptResult.error.message }, { status: 500 });
  }
  if (attemptResult.error) {
    return NextResponse.json({ error: attemptResult.error.message }, { status: 500 });
  }

  const leaseExpiresAt = typeof attemptResult.data?.lease_expires_at === "string"
    ? Date.parse(attemptResult.data.lease_expires_at)
    : Number.NaN;
  const retryAvailable = data.status === "generating" &&
    attemptResult.data?.state === "reserved" &&
    Number.isFinite(leaseExpiresAt) &&
    leaseExpiresAt <= Date.now();

  return NextResponse.json(
    {
      session: {
        id: data.id,
        generationId: data.generation_id,
        selectedVariantId: data.selected_variant_id,
        genre: typeof data.genre === "string" ? data.genre : null,
        occasion: data.occasion,
        mood: data.mood,
        recommendation: data.recommendation,
        status: retryAvailable ? "failed" : data.status,
        errorMessage: retryAvailable
          ? "이전 생성 요청의 확인 시간이 끝났습니다. 예약된 크레딧으로 안전하게 다시 실행할 수 있습니다."
          : data.error_message,
        creditsUsed: data.credits_used,
        generatedImagePath,
        imageUrl,
        creditReceipt: receiptResult.data,
        completionNotificationStatus: notificationState?.status ?? null,
        completionNotificationSentAt: notificationState?.sentAt ?? null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    },
    { status: 200 },
  );
}
