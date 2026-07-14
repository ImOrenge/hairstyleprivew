import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

function countVariants(options: unknown) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return { total: 0, completed: 0, failed: 0 };
  }
  const recommendationSet = (options as Record<string, unknown>).recommendationSet;
  if (!recommendationSet || typeof recommendationSet !== "object" || Array.isArray(recommendationSet)) {
    return { total: 0, completed: 0, failed: 0 };
  }
  const variants = (recommendationSet as Record<string, unknown>).variants;
  if (!Array.isArray(variants)) {
    return { total: 0, completed: 0, failed: 0 };
  }
  return variants.reduce(
    (counts, variant) => {
      counts.total += 1;
      if (variant && typeof variant === "object" && !Array.isArray(variant)) {
        const status = (variant as Record<string, unknown>).status;
        if (status === "completed") counts.completed += 1;
        if (status === "failed") counts.failed += 1;
      }
      return counts;
    },
    { total: 0, completed: 0, failed: 0 },
  );
}

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: generationId } = await params;
  const supabase = getSupabaseAdminClient();
  const { data: generation, error } = await supabase
    .from("generations")
    .select("id,user_id,status,options,updated_at,completion_notification_status")
    .eq("id", generationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!generation) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }
  if (generation.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const counts = countVariants(generation.options);
  const terminal = generation.status === "completed" || generation.status === "failed";
  return NextResponse.json({
    generationId,
    status: generation.status,
    terminal,
    variants: counts,
    updatedAt: generation.updated_at,
    notificationStatus: generation.completion_notification_status,
  });
}
