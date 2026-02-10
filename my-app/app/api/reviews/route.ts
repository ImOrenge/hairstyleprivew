import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../lib/supabase";

interface CreateReviewRequest {
  generationId?: string;
  rating?: number;
  comment?: string;
}

interface ReviewRecord {
  id: string;
  generation_id: string;
  rating: number;
  comment: string;
  created_at: string;
  updated_at: string;
}

function isValidRating(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5;
}

function parseGenerationIdFromUrl(request: Request): string {
  const url = new URL(request.url);
  return url.searchParams.get("generationId")?.trim() ?? "";
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const generationId = parseGenerationIdFromUrl(request);
  if (!generationId) {
    return NextResponse.json({ error: "generationId is required" }, { status: 400 });
  }

  if (generationId.length > 120) {
    return NextResponse.json({ error: "generationId is too long" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient() as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            eq: (column: string, value: string) => {
              maybeSingle: () => Promise<{ data: ReviewRecord | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };

    const { data, error } = await supabase
      .from("generation_reviews")
      .select("id,generation_id,rating,comment,created_at,updated_at")
      .eq("user_id", userId)
      .eq("generation_id", generationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ review: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateReviewRequest;
  const generationId = body.generationId?.trim() ?? "";
  const comment = body.comment?.trim() ?? "";
  const rating = body.rating;

  if (!generationId) {
    return NextResponse.json({ error: "generationId is required" }, { status: 400 });
  }

  if (generationId.length > 120) {
    return NextResponse.json({ error: "generationId is too long" }, { status: 400 });
  }

  if (!isValidRating(rating)) {
    return NextResponse.json({ error: "rating must be an integer between 1 and 5" }, { status: 400 });
  }

  if (comment.length < 5 || comment.length > 800) {
    return NextResponse.json({ error: "comment must be between 5 and 800 characters" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient() as unknown as {
      from: (table: string) => {
        upsert: (
          values: Record<string, unknown>,
          options: { onConflict: string },
        ) => {
          select: (columns: string) => {
            single: () => Promise<{ data: ReviewRecord | null; error: { message: string } | null }>;
          };
        };
      };
    };

    const { data, error } = await supabase
      .from("generation_reviews")
      .upsert(
        {
          user_id: userId,
          generation_id: generationId,
          rating,
          comment,
        },
        { onConflict: "user_id,generation_id" },
      )
      .select("id,generation_id,rating,comment,created_at,updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ review: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
