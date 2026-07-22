import { auth } from "@clerk/nextjs/server";
import {
  isGenerationFunnelEvent,
  isGenerationTerminal,
  type GenerationFunnelClientSource,
} from "@hairfit/shared";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

interface FunnelEventRequest {
  event?: unknown;
  source?: unknown;
}

interface FunnelEventClient {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_SOURCES = new Set<GenerationFunnelClientSource>(["web", "mobile"]);

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth({ acceptsToken: "session_token" });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid generation id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as FunnelEventRequest;
  if (!isGenerationFunnelEvent(body.event) || body.event !== "result_opened") {
    return NextResponse.json({ error: "Unsupported generation event" }, { status: 400 });
  }
  if (typeof body.source !== "string" || !CLIENT_SOURCES.has(body.source as GenerationFunnelClientSource)) {
    return NextResponse.json({ error: "Unsupported generation event source" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: generation, error: generationError } = await supabase
    .from("generations")
    .select("id,user_id,status")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle<{ id: string; user_id: string; status: string }>();

  if (generationError) {
    return NextResponse.json({ error: "Could not verify generation" }, { status: 500 });
  }
  if (!generation) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }
  if (!isGenerationTerminal(generation.status)) {
    return NextResponse.json({ error: "Generation result is not ready" }, { status: 409 });
  }

  const { error } = await (supabase as unknown as FunnelEventClient).rpc(
    "record_generation_funnel_event",
    {
      p_generation_id: id,
      p_user_id: userId,
      p_event_name: "result_opened",
      p_source: body.source,
      p_metadata: { status: generation.status },
    },
  );

  if (error) {
    console.warn("[generation-funnel] Result-open event was not recorded", {
      generationId: id,
      userId,
      source: body.source,
      message: error.message,
    });
    return NextResponse.json({ error: "Could not record generation event" }, { status: 500 });
  }

  return NextResponse.json(
    { accepted: true, event: "result_opened" as const },
    { status: 202 },
  );
}
