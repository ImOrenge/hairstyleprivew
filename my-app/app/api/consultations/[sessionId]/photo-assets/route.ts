import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createGenerationImageSignedUrl } from "../../../../../lib/generation-image-storage";
import { readServerConsultation } from "../../../../../lib/consulting/server-store";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

interface Params { params: Promise<{ sessionId: string }> }
export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { sessionId } = await params;
  const snapshot = await readServerConsultation(userId, sessionId);
  if (!snapshot) return NextResponse.json({ error: "상담을 찾지 못했습니다." }, { status: 404 });
  if (!snapshot.photo.usageScopes.includes("analysis")) return NextResponse.json({ error: "사진 분석 사용 범위가 허용되지 않았습니다." }, { status: 403 });
  const supabase = getSupabaseAdminClient();
  let originalImagePath: string | null = null;
  if (snapshot.photo.generationId) {
    const { data, error } = await supabase.from("generations").select("original_image_path,original_deleted_at").eq("id", snapshot.photo.generationId).eq("user_id", userId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data && !data.original_deleted_at && typeof data.original_image_path === "string") originalImagePath = data.original_image_path;
  }
  if (!originalImagePath && snapshot.photo.draftId) {
    const { data, error } = await supabase.from("generation_upload_drafts").select("original_image_path,state,expires_at").eq("id", snapshot.photo.draftId).eq("user_id", userId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data && ["ready", "accepted"].includes(String(data.state)) && Date.parse(String(data.expires_at)) > Date.now() && typeof data.original_image_path === "string") originalImagePath = data.original_image_path;
  }
  if (!originalImagePath) return NextResponse.json({ error: "원본 사진의 보존 기간이 끝났습니다." }, { status: 410 });
  const primaryUrl = await createGenerationImageSignedUrl(supabase, originalImagePath, 60 * 10);
  return primaryUrl ? NextResponse.json({ primaryUrl, expiresIn: 600 }) : NextResponse.json({ error: "사진 주소를 만들지 못했습니다." }, { status: 410 });
}
