import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../lib/admin-auth";
import { trimText } from "../../../../../lib/onboarding";

interface Params {
  params: Promise<{ id: string }>;
}

export async function DELETE(_: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const resolvedParams = await params;
  const reviewId = trimText(resolvedParams.id, 160);
  if (!reviewId) {
    return NextResponse.json({ error: "Review id is required" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("generation_reviews")
    .delete()
    .eq("id", reviewId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, id: data.id }, { status: 200 });
}
