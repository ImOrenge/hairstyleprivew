import { NextResponse } from "next/server";
import { removeGenerationOriginalImage } from "../../../../../lib/generation-image-storage";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

function isAuthorized(request: Request) {
  const expected = process.env.GENERATION_WORKFLOW_CALLBACK_SECRET?.trim();
  const supplied = request.headers.get("x-hairfit-generation-secret")?.trim();
  return Boolean(expected && supplied && expected === supplied);
}

export async function POST(request: Request, { params }: Params) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: generationId } = await params;
  const supabase = getSupabaseAdminClient();
  const { data: generation, error } = await supabase
    .from("generations")
    .select("status,original_image_path")
    .eq("id", generationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!generation) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }
  if (generation.status !== "completed" && generation.status !== "failed") {
    return NextResponse.json({ error: "Generation is not terminal" }, { status: 409 });
  }

  const removed = await removeGenerationOriginalImage(
    supabase,
    typeof generation.original_image_path === "string" ? generation.original_image_path : null,
  );

  if (removed) {
    const { error: markerError } = await supabase
      .from("generations")
      .update({ original_image_path: `deleted-original://${generationId}` })
      .eq("id", generationId);
    if (markerError) {
      return NextResponse.json({ error: markerError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ generationId, removed });
}
