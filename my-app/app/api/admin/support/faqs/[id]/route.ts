import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../../lib/admin-auth";
import { trimText } from "../../../../../../lib/onboarding";

interface Params {
  params: Promise<{ id: string }>;
}

interface UpdateSupportFaqBody {
  question?: unknown;
  answer?: unknown;
  category?: unknown;
  sortOrder?: unknown;
  isPublished?: unknown;
}

function parseSortOrder(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(10000, Math.max(0, Math.floor(parsed)));
}

export async function PATCH(request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const resolvedParams = await params;
  const faqId = trimText(resolvedParams.id, 160);
  if (!faqId) {
    return NextResponse.json({ error: "FAQ id is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as UpdateSupportFaqBody;
  const updates: Record<string, unknown> = { updated_by: context.userId };

  if (body.question !== undefined) {
    const question = trimText(body.question, 160);
    if (question.length < 4) {
      return NextResponse.json({ error: "question must be between 4 and 160 characters" }, { status: 400 });
    }
    updates.question = question;
  }

  if (body.answer !== undefined) {
    const answer = trimText(body.answer, 3000);
    if (answer.length < 10) {
      return NextResponse.json({ error: "answer must be between 10 and 3000 characters" }, { status: 400 });
    }
    updates.answer = answer;
  }

  if (body.category !== undefined) {
    updates.category = trimText(body.category, 80) || "general";
  }

  if (body.sortOrder !== undefined) {
    const sortOrder = parseSortOrder(body.sortOrder);
    if (sortOrder === null) {
      return NextResponse.json({ error: "sortOrder is invalid" }, { status: 400 });
    }
    updates.sort_order = sortOrder;
  }

  if (body.isPublished !== undefined) {
    if (typeof body.isPublished !== "boolean") {
      return NextResponse.json({ error: "isPublished must be boolean" }, { status: 400 });
    }
    updates.is_published = body.isPublished;
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("support_faqs")
    .update(updates)
    .eq("id", faqId)
    .select("id,question,answer,category,sort_order,is_published,created_at,updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "FAQ not found" }, { status: 404 });
  }

  return NextResponse.json({ faq: data }, { status: 200 });
}

export async function DELETE(_: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const resolvedParams = await params;
  const faqId = trimText(resolvedParams.id, 160);
  if (!faqId) {
    return NextResponse.json({ error: "FAQ id is required" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("support_faqs")
    .delete()
    .eq("id", faqId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "FAQ not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, id: data.id }, { status: 200 });
}
