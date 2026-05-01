import { NextResponse } from "next/server";
import { getMobileApiContext } from "../../../../lib/mobile-auth";

interface HairRecordRow {
  id?: unknown;
  generation_id?: unknown;
  style_name?: unknown;
  service_type?: unknown;
  service_date?: unknown;
  next_visit_target_days?: unknown;
  created_at?: unknown;
}

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

interface QueryBuilder<T> extends PromiseLike<QueryResult<T>> {
  eq: (column: string, value: unknown) => QueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder<T>;
  limit: (count: number) => QueryBuilder<T>;
}

interface MobileAftercareSupabase {
  from: <T = Record<string, unknown>>(table: string) => {
    select: (columns: string) => QueryBuilder<T>;
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown) {
  const valueText = text(value).trim();
  return valueText || null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function GET() {
  const context = await getMobileApiContext();
  if (!context.ok) {
    return context.response;
  }

  try {
    const supabase = context.supabase as unknown as MobileAftercareSupabase;
    const { data, error } = await supabase
      .from<HairRecordRow>("user_hair_records")
      .select("id,generation_id,style_name,service_type,service_date,next_visit_target_days,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        records: (data || []).map((row) => ({
          id: text(row.id),
          generationId: nullableText(row.generation_id),
          styleName: text(row.style_name) || "Hair style",
          serviceType: text(row.service_type) || "other",
          serviceDate: text(row.service_date),
          nextVisitTargetDays: numberValue(row.next_visit_target_days),
          createdAt: text(row.created_at),
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
