import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  DEFAULT_NEXT_VISIT_DAYS,
  generateHairCareContents,
  type ServiceType,
} from "../../../lib/hair-care-generator";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../lib/supabase";

interface CreateHairRecordBody {
  generationId?: string;
  styleName?: string;
  serviceType?: string;
  serviceDate?: string; // YYYY-MM-DD
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_SERVICE_TYPES: ServiceType[] = ["perm", "color", "cut", "bleach", "treatment", "other"];

function isServiceType(value: string): value is ServiceType {
  return (VALID_SERVICE_TYPES as string[]).includes(value);
}

function scheduledAt(serviceDate: string, dayOffset: number): string {
  const date = new Date(`${serviceDate}T10:00:00+09:00`);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
}

function replaceCta(html: string, url: string): string {
  return html.replaceAll("{{CTA_URL}}", url);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateHairRecordBody;
  const generationId = body.generationId?.trim();
  const styleName = body.styleName?.trim().slice(0, 80);
  const serviceTypeRaw = body.serviceType?.trim().toLowerCase();
  const serviceDate = body.serviceDate?.trim();

  if (!styleName) {
    return NextResponse.json({ error: "styleName is required" }, { status: 400 });
  }

  if (!serviceTypeRaw || !isServiceType(serviceTypeRaw)) {
    return NextResponse.json(
      { error: `serviceType must be one of ${VALID_SERVICE_TYPES.join("/")}` },
      { status: 400 },
    );
  }

  if (!serviceDate || !DATE_RE.test(serviceDate)) {
    return NextResponse.json({ error: "serviceDate must be YYYY-MM-DD" }, { status: 400 });
  }

  if (generationId && !UUID_RE.test(generationId)) {
    return NextResponse.json({ error: "generationId format is invalid" }, { status: 400 });
  }

  const serviceType: ServiceType = serviceTypeRaw;
  const nextVisitDays = DEFAULT_NEXT_VISIT_DAYS[serviceType];
  const origin = new URL(request.url).origin;
  const ctaUrl = `${origin}/upload`;
  const supabase = getSupabaseAdminClient();

  let contents: Awaited<ReturnType<typeof generateHairCareContents>>;
  try {
    contents = await generateHairCareContents({
      styleName,
      serviceType,
      serviceDate,
    });
  } catch (error) {
    console.error("[hair-records] care content generation failed:", error);
    return NextResponse.json({ error: "care content generation failed" }, { status: 500 });
  }

  const { data: record, error: recordError } = await supabase
    .from("user_hair_records")
    .insert({
      user_id: userId,
      generation_id: generationId ?? null,
      style_name: styleName,
      service_type: serviceType,
      service_date: serviceDate,
      next_visit_target_days: nextVisitDays,
    })
    .select("id")
    .single<{ id: string }>();

  if (recordError || !record) {
    console.error("[hair-records] record insert failed:", recordError?.message);
    return NextResponse.json({ error: "hair record save failed" }, { status: 500 });
  }

  const hairRecordId = record.id;
  const careRows = contents.map((content) => ({
    user_id: userId,
    hair_record_id: hairRecordId,
    content_type: content.contentType,
    day_offset: content.dayOffset,
    subject: content.subject,
    body_html: replaceCta(content.bodyHtml, ctaUrl),
    scheduled_send_at: scheduledAt(serviceDate, content.dayOffset),
  }));

  const { error: careInsertError } = await supabase.from("user_care_contents").insert(careRows);

  if (careInsertError) {
    console.error("[hair-records] care content insert failed:", careInsertError.message);
    return NextResponse.json({ error: "care content save failed" }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("user_hair_records")
    .update({ care_generated_at: new Date().toISOString() })
    .eq("id", hairRecordId);

  if (updateError) {
    console.error("[hair-records] care_generated_at update failed:", updateError.message);
  }

  console.info(`[hair-records] created ${contents.length} care contents for record ${hairRecordId}`);

  return NextResponse.json(
    {
      hairRecordId,
      styleName,
      serviceType,
      serviceDate,
      nextVisitTargetDays: nextVisitDays,
      careScheduledCount: contents.length,
    },
    { status: 201 },
  );
}
