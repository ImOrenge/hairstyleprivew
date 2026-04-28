import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/supabase";
import {
  STYLING_RESULTS_BUCKET,
  createSignedUrl,
  type ServerSupabaseLike,
} from "../../../../lib/style-profile-server";

interface Params {
  params: Promise<{ id: string }>;
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

  const supabase = getSupabaseAdminClient() as unknown as ServerSupabaseLike;
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
  const imageUrl = await createSignedUrl(supabase, STYLING_RESULTS_BUCKET, generatedImagePath);

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
        status: data.status,
        errorMessage: data.error_message,
        creditsUsed: data.credits_used,
        generatedImagePath,
        imageUrl,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    },
    { status: 200 },
  );
}
