import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../../lib/admin-auth";
import { trimText } from "../../../../../../lib/onboarding";

interface Params {
  params: Promise<{ id: string }>;
}

interface VisibilityRequestBody {
  hidden?: unknown;
  reason?: unknown;
}

interface ReviewRow {
  id: string;
  user_id: string;
  generation_id: string;
  rating: number;
  comment: string;
  is_hidden: boolean;
  hidden_reason: string | null;
  hidden_at: string | null;
  hidden_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function PATCH(request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const resolvedParams = await params;
  const reviewId = trimText(resolvedParams.id, 160);
  if (!reviewId) {
    return NextResponse.json({ error: "Review id is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as VisibilityRequestBody;
  if (typeof body.hidden !== "boolean") {
    return NextResponse.json({ error: "hidden must be boolean" }, { status: 400 });
  }

  const reason = trimText(body.reason, 500);
  if (body.hidden && !reason) {
    return NextResponse.json({ error: "reason is required when hiding a review" }, { status: 400 });
  }

  const updates = body.hidden
    ? {
        is_hidden: true,
        hidden_reason: reason || null,
        hidden_at: new Date().toISOString(),
        hidden_by: context.userId,
      }
    : {
        is_hidden: false,
        hidden_reason: null,
        hidden_at: null,
        hidden_by: null,
      };

  const { data, error } = await context.supabase
    .from("generation_reviews")
    .update(updates)
    .eq("id", reviewId)
    .select(
      "id,user_id,generation_id,rating,comment,is_hidden,hidden_reason,hidden_at,hidden_by,created_at,updated_at",
    )
    .maybeSingle<ReviewRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  return NextResponse.json({ review: data }, { status: 200 });
}
