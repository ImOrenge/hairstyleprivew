import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../lib/admin-auth";
import { buildLegacyAftercareEmailItem, type AftercareEmailCheckpoint } from "../../../../lib/aftercare-email";
import { getSiteUrl } from "../../../../lib/site-url";

const STATUSES = new Set([
  "pending","paused","held_for_review","claimed","provider_accepted","delivered",
  "retry_wait","delivery_unknown","bounced","dead_letter","cancelled",
]);

export async function GET(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) return context.response;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "held_for_review";
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || 80));
  let query = context.supabase
    .from("aftercare_email_outbox")
    .select("id,checkpoint,subject,recipient_email,scheduled_send_at,status,attempt_count,max_attempts,provider_message_id,provider_last_event,last_error_kind,last_error,created_at,updated_at")
    .order("scheduled_send_at", { ascending: true })
    .limit(limit);
  if (STATUSES.has(status)) query = query.eq("status", status);
  const [rows, legacy, summary] = await Promise.all([
    query,
    context.supabase.from("aftercare_email_legacy_review")
      .select("legacy_care_content_id,user_id,status,original_scheduled_send_at,source_snapshot,reviewed_at")
      .eq("status", "held_for_review")
      .order("original_scheduled_send_at", { ascending: true })
      .limit(limit),
    context.supabase.from("aftercare_email_outbox").select("status"),
  ]);
  if (rows.error || legacy.error || summary.error) {
    return NextResponse.json({ error: rows.error?.message || legacy.error?.message || summary.error?.message }, { status: 500 });
  }
  const counts = (summary.data || []).reduce<Record<string, number>>((acc, row) => {
    const key = String(row.status);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return NextResponse.json({ emails: rows.data || [], legacyHeld: legacy.data || [], counts });
}

const LEGACY_CHECKPOINT: Record<string, AftercareEmailCheckpoint> = {
  dry_guide: "d1", day3_care: "d3", week1_tip: "d7", month1_revisit: "d30", month1_trend: "d45", month3_cta: "d90",
};

export async function POST(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) return context.response;
  const body = (await request.json().catch(() => ({}))) as { outboxId?: unknown; legacyCareContentId?: unknown; action?: unknown; scheduledSendAt?: unknown };
  if ((typeof body.outboxId !== "string" && typeof body.legacyCareContentId !== "string") || !["release", "cancel", "retry"].includes(String(body.action))) {
    return NextResponse.json({ error: "운영 작업 요청을 확인해 주세요." }, { status: 400 });
  }
  const scheduledSendAt = typeof body.scheduledSendAt === "string" ? body.scheduledSendAt : null;
  if (body.action === "release" && (!scheduledSendAt || new Date(scheduledSendAt).getTime() <= Date.now())) {
    return NextResponse.json({ error: "격리 해제는 미래 재예약 시각이 필요합니다." }, { status: 400 });
  }
  if (typeof body.legacyCareContentId === "string") {
    if (body.action === "cancel") {
      const cancelled = await context.supabase.rpc("cancel_legacy_aftercare_email", {
        p_legacy_care_content_id: body.legacyCareContentId,
        p_actor: context.userId,
      });
      if (cancelled.error || cancelled.data !== true) return NextResponse.json({ error: cancelled.error?.message || "격리 건을 취소하지 못했습니다." }, { status: 409 });
      return NextResponse.json({ status: "cancelled" });
    }
    if (body.action !== "release" || !scheduledSendAt) return NextResponse.json({ error: "격리 건에는 해제 또는 취소만 사용할 수 있습니다." }, { status: 400 });
    const review = await context.supabase.from("aftercare_email_legacy_review")
      .select("source_snapshot")
      .eq("legacy_care_content_id", body.legacyCareContentId)
      .eq("status", "held_for_review")
      .single();
    if (review.error) return NextResponse.json({ error: review.error.message }, { status: 404 });
    const snapshot = review.data.source_snapshot as { contentType?: unknown; hairRecordId?: unknown };
    const checkpoint = LEGACY_CHECKPOINT[String(snapshot.contentType || "")];
    if (!checkpoint || typeof snapshot.hairRecordId !== "string") return NextResponse.json({ error: "레거시 원본 식별자가 올바르지 않습니다." }, { status: 409 });
    const hairRecord = await context.supabase.from("user_hair_records").select("style_name").eq("id", snapshot.hairRecordId).single();
    if (hairRecord.error) return NextResponse.json({ error: hairRecord.error.message }, { status: 409 });
    const baseUrl = /^https:\/\//i.test(getSiteUrl()) ? getSiteUrl() : "https://hairfit.beauty";
    const item = buildLegacyAftercareEmailItem({
      legacyCareContentId: body.legacyCareContentId,
      hairRecordId: snapshot.hairRecordId,
      checkpoint,
      styleName: String(hairRecord.data.style_name || "시술 스타일"),
      baseUrl,
    });
    const released = await context.supabase.rpc("release_legacy_aftercare_email", {
      p_legacy_care_content_id: body.legacyCareContentId,
      p_scheduled_send_at: scheduledSendAt,
      p_item: item,
      p_actor: context.userId,
    });
    if (released.error) return NextResponse.json({ error: released.error.message }, { status: 409 });
    return NextResponse.json({ status: "pending", outboxId: released.data });
  }

  const result = await context.supabase.rpc("admin_aftercare_email_action", {
    p_outbox_id: body.outboxId,
    p_action: body.action,
    p_scheduled_send_at: scheduledSendAt,
    p_actor: context.userId,
  });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 409 });
  return NextResponse.json({ status: result.data });
}
