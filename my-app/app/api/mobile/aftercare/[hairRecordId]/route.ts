import { NextResponse } from "next/server";
import type { AftercareGuide, AftercareSectionKey } from "../../../../../lib/aftercare-guide-generator";
import { getMobileApiContext } from "../../../../../lib/mobile-auth";

interface Params {
  params: Promise<{ hairRecordId: string }>;
}

interface HairRecordRow {
  id?: unknown;
  generation_id?: unknown;
  style_name?: unknown;
  service_type?: unknown;
  service_date?: unknown;
  next_visit_target_days?: unknown;
  created_at?: unknown;
}

interface GuideRow {
  id?: unknown;
  guide_json?: unknown;
}

interface QuerySingleResult<T> {
  data: T | null;
  error: { message: string } | null;
}

interface QueryBuilder<T> {
  eq: (column: string, value: unknown) => QueryBuilder<T>;
  maybeSingle: () => Promise<QuerySingleResult<T>>;
}

interface MobileAftercareSupabase {
  from: <T = Record<string, unknown>>(table: string) => {
    select: (columns: string) => QueryBuilder<T>;
  };
}

const sectionOrder: AftercareSectionKey[] = ["dry", "treatment", "iron", "styling"];

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGuide(raw: unknown): AftercareGuide | null {
  if (!isObject(raw) || !isObject(raw.overview) || !isObject(raw.sections)) {
    return null;
  }

  const sections = raw.sections;
  const hasSections = sectionOrder.every((key) => isObject(sections[key]));
  if (!hasSections) {
    return null;
  }

  return raw as unknown as AftercareGuide;
}

function toRecord(row: HairRecordRow) {
  return {
    id: text(row.id),
    generationId: nullableText(row.generation_id),
    styleName: text(row.style_name) || "Hair style",
    serviceType: text(row.service_type) || "other",
    serviceDate: text(row.service_date),
    nextVisitTargetDays: numberValue(row.next_visit_target_days),
    createdAt: text(row.created_at),
  };
}

export async function GET(_request: Request, { params }: Params) {
  const context = await getMobileApiContext();
  if (!context.ok) {
    return context.response;
  }

  const { hairRecordId } = await params;
  const id = hairRecordId?.trim();
  if (!id) {
    return NextResponse.json({ error: "hairRecordId is required" }, { status: 400 });
  }

  try {
    const supabase = context.supabase as unknown as MobileAftercareSupabase;
    const { data: record, error: recordError } = await supabase
      .from<HairRecordRow>("user_hair_records")
      .select("id,generation_id,style_name,service_type,service_date,next_visit_target_days,created_at")
      .eq("id", id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (recordError) {
      return NextResponse.json({ error: recordError.message }, { status: 500 });
    }
    if (!record) {
      return NextResponse.json({ error: "Aftercare record not found" }, { status: 404 });
    }

    const { data: guideRow, error: guideError } = await supabase
      .from<GuideRow>("user_aftercare_guides")
      .select("id,guide_json")
      .eq("hair_record_id", id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (guideError) {
      return NextResponse.json({ error: guideError.message }, { status: 500 });
    }

    const guide = parseGuide(guideRow?.guide_json);
    if (!guide) {
      return NextResponse.json({ error: "Aftercare guide not found" }, { status: 404 });
    }

    return NextResponse.json({ record: toRecord(record), guide }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
