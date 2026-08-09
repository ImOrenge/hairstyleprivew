import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createGenerationImageSignedUrl } from "../../../../../../lib/generation-image-storage";
import { getSupabaseAdminClient } from "../../../../../../lib/supabase";
import { getAnalysisEvidenceV2 } from "../../../../../../lib/v2/analysis-server";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";

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
      .select("source_generation_id")
      .eq("id", consultationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (consultation.error) throw new Error(consultation.error.message);
    const generationId = (consultation.data as { source_generation_id?: unknown } | null)?.source_generation_id;
    let sourceImageUrl: string | null = null;
    if (typeof generationId === "string") {
      const generation = await db
        .from("generations")
        .select("original_image_path")
        .eq("id", generationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (generation.error) throw new Error(generation.error.message);
      const path = (generation.data as { original_image_path?: unknown } | null)?.original_image_path;
      sourceImageUrl = await createGenerationImageSignedUrl(db, typeof path === "string" ? path : null);
    }
    return NextResponse.json({
      evidence,
      sourceImageUrl,
      overlayEnabled: process.env.FACE_TRUST_OVERLAY_V2_ENABLED !== "false",
    });
  } catch (error) { return v2Failure(error); }
}
