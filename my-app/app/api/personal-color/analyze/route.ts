import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { analyzePersonalColor } from "../../../../lib/personal-color";
import {
  ensureCurrentUserProfile,
  type ServerSupabaseLike,
} from "../../../../lib/style-profile-server";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

interface PersonalColorAnalyzeRequest {
  referenceImageDataUrl?: string;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as PersonalColorAnalyzeRequest;
  const referenceImageDataUrl = body.referenceImageDataUrl?.trim() || "";
  if (!referenceImageDataUrl) {
    return NextResponse.json({ error: "referenceImageDataUrl is required" }, { status: 400 });
  }
  if (referenceImageDataUrl.length > 12_000_000) {
    return NextResponse.json({ error: "referenceImageDataUrl is too large" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as ServerSupabaseLike;
  const ensured = await ensureCurrentUserProfile(userId, supabase);
  if (ensured.error) {
    return NextResponse.json({ error: ensured.error.message }, { status: 500 });
  }

  try {
    const personalColor = await analyzePersonalColor(referenceImageDataUrl);
    const { error } = await supabase
      .from("user_style_profiles")
      .upsert(
        {
          user_id: userId,
          personal_color_tone: personalColor.tone,
          personal_color_contrast: personalColor.contrast,
          personal_color_result: personalColor,
          personal_color_model: personalColor.model,
          personal_color_diagnosed_at: personalColor.diagnosedAt,
        },
        { onConflict: "user_id" },
      )
      .select("user_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ personalColor }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Personal color analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
