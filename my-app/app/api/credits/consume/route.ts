import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCreditsPerStyle } from "../../../../lib/pricing-plan";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

interface ConsumeCreditsRequest {
  generationId?: string;
  amount?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

const uuidV4LikeRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ConsumeCreditsRequest;
  const generationId = body.generationId?.trim();
  const amount = body.amount ?? getCreditsPerStyle();
  const reason = body.reason?.trim() || "generation_usage";
  const metadata = body.metadata ?? {};

  if (!generationId || !uuidV4LikeRegex.test(generationId)) {
    return NextResponse.json({ error: "generationId must be a valid UUID" }, { status: 400 });
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive integer" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const rpcParams = {
      p_user_id: userId,
      p_generation_id: generationId,
      p_amount: amount,
      p_reason: reason,
      p_metadata: metadata,
    };
    const { data, error } = await (supabase as never as {
      rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    }).rpc("consume_credits", rpcParams);

    if (error) {
      if (error.message.toLowerCase().includes("insufficient credits")) {
        return NextResponse.json({ error: "Insufficient credits" }, { status: 409 });
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ledgerId: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
