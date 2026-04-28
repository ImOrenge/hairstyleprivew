// POST /api/hair-records
// 결과 페이지에서 "이 스타일로 확정" 클릭 시 호출
// 1. user_hair_records 생성
// 2. Gemini로 케어 콘텐츠 6개 생성
// 3. user_care_contents에 예약 저장
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
const VALID_SERVICE_TYPES: ServiceType[] = [
  "perm", "color", "cut", "bleach", "treatment", "other",
];

function isServiceType(v: string): v is ServiceType {
  return (VALID_SERVICE_TYPES as string[]).includes(v);
}

/** serviceDate + dayOffset → scheduled_send_at (UTC ISO) */
function scheduledAt(serviceDate: string, dayOffset: number): string {
  const d = new Date(`${serviceDate}T10:00:00+09:00`); // 오전 10시 KST 발송
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString();
}

/** {{CTA_URL}} 치환 */
function replaceCta(html: string, url: string): string {
  return html.replaceAll("{{CTA_URL}}", url);
}

export async function POST(request: Request) {
  // 1. 인증
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // 2. 요청 파싱 & 검증
  const body = (await request.json().catch(() => ({}))) as CreateHairRecordBody;

  const generationId = body.generationId?.trim();
  const styleName = body.styleName?.trim().slice(0, 80);
  const serviceTypeRaw = body.serviceType?.trim().toLowerCase();
  const serviceDate = body.serviceDate?.trim();

  if (!styleName) {
    return NextResponse.json({ error: "styleName이 필요합니다" }, { status: 400 });
  }
  if (!serviceTypeRaw || !isServiceType(serviceTypeRaw)) {
    return NextResponse.json(
      { error: `serviceType은 ${VALID_SERVICE_TYPES.join("/")} 중 하나여야 합니다` },
      { status: 400 },
    );
  }
  if (!serviceDate || !DATE_RE.test(serviceDate)) {
    return NextResponse.json(
      { error: "serviceDate는 YYYY-MM-DD 형식이어야 합니다" },
      { status: 400 },
    );
  }
  if (generationId && !UUID_RE.test(generationId)) {
    return NextResponse.json({ error: "generationId 형식 오류" }, { status: 400 });
  }

  const serviceType: ServiceType = serviceTypeRaw;
  const nextVisitDays = DEFAULT_NEXT_VISIT_DAYS[serviceType];
  const origin = new URL(request.url).origin;
  const ctaUrl = `${origin}/upload`;

  const supabase = getSupabaseAdminClient() as unknown as {
    from: (table: string) => {
      insert: (v: Record<string, unknown>) => {
        select: (c: string) => {
          single: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
        };
      };
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  // 3. user_hair_records 생성
  const { data: record, error: recordErr } = await supabase
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

  if (recordErr || !record) {
    console.error("[hair-records] DB insert 실패:", recordErr?.message);
    return NextResponse.json({ error: "시술 기록 저장 실패" }, { status: 500 });
  }

  const hairRecordId = record.id;

  // 4. Gemini 케어 콘텐츠 생성 (비동기 — 클라이언트에는 즉시 응답)
  //    실패해도 hairRecord 자체는 유지됨
  void (async () => {
    try {
      const contents = await generateHairCareContents({
        styleName,
        serviceType,
        serviceDate,
      });

      // user_care_contents bulk insert
      for (const content of contents) {
        await supabase
          .from("user_care_contents")
          .insert({
            user_id: userId,
            hair_record_id: hairRecordId,
            content_type: content.contentType,
            day_offset: content.dayOffset,
            subject: content.subject,
            body_html: replaceCta(content.bodyHtml, ctaUrl),
            scheduled_send_at: scheduledAt(serviceDate, content.dayOffset),
          })
          .select("id")
          .single();
      }

      // care_generated_at 업데이트
      await supabase
        .from("user_hair_records")
        .update({ care_generated_at: new Date().toISOString() })
        .eq("id", hairRecordId);

      console.info(
        `[hair-records] ${styleName} 케어 콘텐츠 ${contents.length}개 생성 완료 (record: ${hairRecordId})`,
      );
    } catch (err) {
      console.error("[hair-records] 케어 콘텐츠 생성 실패:", err);
    }
  })();

  return NextResponse.json(
    {
      hairRecordId,
      styleName,
      serviceType,
      serviceDate,
      nextVisitTargetDays: nextVisitDays,
      careScheduledCount: 6,
    },
    { status: 201 },
  );
}
