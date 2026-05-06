import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../lib/admin-auth";
import { trimText } from "../../../../../lib/onboarding";

interface UpsertSupportFaqBody {
  question?: unknown;
  answer?: unknown;
  category?: unknown;
  sortOrder?: unknown;
  isPublished?: unknown;
}

function parseSortOrder(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.min(10000, Math.max(0, Math.floor(parsed)));
}

function parsePublished(value: unknown) {
  return typeof value === "boolean" ? value : true;
}

export async function GET() {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const { data, error } = await context.supabase
    .from("support_faqs")
    .select("id,question,answer,category,sort_order,is_published,created_at,updated_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ faqs: data || [] }, { status: 200 });
}

export async function POST(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const body = (await request.json().catch(() => ({}))) as UpsertSupportFaqBody;
  const question = trimText(body.question, 160);
  const answer = trimText(body.answer, 3000);
  const category = trimText(body.category, 80) || "general";

  if (question.length < 4) {
    return NextResponse.json({ error: "question must be between 4 and 160 characters" }, { status: 400 });
  }

  if (answer.length < 10) {
    return NextResponse.json({ error: "answer must be between 10 and 3000 characters" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("support_faqs")
    .insert({
      question,
      answer,
      category,
      sort_order: parseSortOrder(body.sortOrder),
      is_published: parsePublished(body.isPublished),
      created_by: context.userId,
      updated_by: context.userId,
    })
    .select("id,question,answer,category,sort_order,is_published,created_at,updated_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "FAQ insert failed" }, { status: 500 });
  }

  return NextResponse.json({ faq: data }, { status: 201 });
}
