import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { EvidenceCorrectionTargetV2, NormalizedPointV2 } from "@hairfit/shared/v2";
import { createGenerationImageSignedUrl } from "../../../../../../lib/generation-image-storage";
import { getFaceObservationBundleV2 } from "../../../../../../lib/personal-color-observation";
import { getSupabaseAdminClient } from "../../../../../../lib/supabase";
import { applyAnalysisEvidenceCorrectionV2, getAnalysisEvidenceV2 } from "../../../../../../lib/v2/analysis-server";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";
import { isHairfitV2Enabled } from "../../../../../../lib/v2/feature-flags";

interface Params { params: Promise<{ consultationId: string }> }
export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "ANALYSIS_EVIDENCE_V2_ENABLED"); if (disabled) return disabled;
  const { consultationId } = await params;
  try {
    const evidence = await getAnalysisEvidenceV2(userId, consultationId);
    if (!evidence) return NextResponse.json({ error: "분석 근거가 없습니다." }, { status: 404 });
    const db = getSupabaseAdminClient();
    const consultation = await db
      .from("consultation_sessions")
      .select("source_generation_id,source_photo_id,snapshot")
      .eq("id", consultationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (consultation.error) throw new Error(consultation.error.message);
    const consultationRow = consultation.data as {
      source_generation_id?: unknown;
      source_photo_id?: unknown;
      snapshot?: { photo?: { draftId?: unknown } };
    } | null;
    const generationId = consultationRow?.source_generation_id;
    let originalImagePath: string | null = null;
    if (typeof generationId === "string") {
      const generation = await db
        .from("generations")
        .select("original_image_path,original_deleted_at")
        .eq("id", generationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (generation.error) throw new Error(generation.error.message);
      const generationRow = generation.data as { original_image_path?: unknown; original_deleted_at?: unknown } | null;
      if (!generationRow?.original_deleted_at && typeof generationRow?.original_image_path === "string") {
        originalImagePath = generationRow.original_image_path;
      }
    }
    const draftId = consultationRow?.source_photo_id ?? consultationRow?.snapshot?.photo?.draftId;
    if (!originalImagePath && typeof draftId === "string") {
      const draft = await db
        .from("generation_upload_drafts")
        .select("original_image_path,state,expires_at")
        .eq("id", draftId)
        .eq("user_id", userId)
        .maybeSingle();
      if (draft.error) throw new Error(draft.error.message);
      const draftRow = draft.data as { original_image_path?: unknown; state?: unknown; expires_at?: unknown } | null;
      if (["ready", "accepted"].includes(String(draftRow?.state))
        && Date.parse(String(draftRow?.expires_at)) > Date.now()
        && typeof draftRow?.original_image_path === "string") {
        originalImagePath = draftRow.original_image_path;
      }
    }
    const sourceImageUrl = await createGenerationImageSignedUrl(db, originalImagePath, 60 * 10);
    const observation = isHairfitV2Enabled("PERSONAL_COLOR_V2_READ")
      ? await getFaceObservationBundleV2(userId, consultationId)
      : null;
    return NextResponse.json({
      evidence,
      observation,
      sourceImageUrl,
      overlayEnabled: process.env.FACE_TRUST_OVERLAY_V2_ENABLED !== "false",
    });
  } catch (error) { return v2Failure(error); }
}

export async function PATCH(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "ANALYSIS_EVIDENCE_V2_ENABLED");
  if (disabled) return disabled;
  const { consultationId } = await params;
  const body = (await request.json().catch(() => null)) as {
    expectedRevision?: number;
    targetType?: EvidenceCorrectionTargetV2;
    targetId?: string;
    pointIndex?: number;
    adjustedPoint?: NormalizedPointV2;
  } | null;
  try {
    const evidence = await applyAnalysisEvidenceCorrectionV2({
      userId,
      consultationId,
      expectedRevision: body?.expectedRevision ?? -1,
      targetType: body?.targetType ?? "landmark",
      targetId: body?.targetId ?? "",
      pointIndex: body?.pointIndex ?? -1,
      adjustedPoint: body?.adjustedPoint ?? { x: -1, y: -1 },
    });
    return NextResponse.json({ evidence });
  } catch (error) {
    return v2Failure(error);
  }
}
