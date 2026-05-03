import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AftercareGuide } from "./aftercare-guide-generator";

export type ServiceType = "perm" | "color" | "cut" | "bleach" | "treatment" | "other";
export type ContentType =
  | "dry_guide"
  | "day3_care"
  | "week1_tip"
  | "month1_revisit"
  | "month1_trend"
  | "month3_cta";

export interface HairCareContentItem {
  contentType: ContentType;
  dayOffset: number;
  subject: string;
  bodyHtml: string;
}

export interface GenerateHairCareInput {
  styleName: string;
  serviceType: ServiceType;
  serviceDate: string;
  aftercareGuide?: AftercareGuide | null;
}

export const DEFAULT_NEXT_VISIT_DAYS: Record<ServiceType, number> = {
  perm: 90,
  color: 45,
  bleach: 40,
  cut: 30,
  treatment: 30,
  other: 60,
};

const SERVICE_TYPE_KO: Record<ServiceType, string> = {
  perm: "펌",
  color: "염색",
  cut: "커트",
  bleach: "탈색",
  treatment: "트리트먼트",
  other: "시술",
};

interface ScheduleItem {
  contentType: ContentType;
  dayOffset: number;
  label: string;
  promptFocus: string;
}

const SCHEDULE: ScheduleItem[] = [
  {
    contentType: "dry_guide",
    dayOffset: 1,
    label: "드라이 방법 가이드",
    promptFocus: "시술 직후 집에서 처음 드라이할 때 필요한 온도, 방향, 뿌리 볼륨, 끝 질감 관리법",
  },
  {
    contentType: "day3_care",
    dayOffset: 3,
    label: "3일차 케어 루틴",
    promptFocus: "샴푸 재개 기준, 트리트먼트 사용법, 생활 습관 주의점, 눌림 복구법",
  },
  {
    contentType: "week1_tip",
    dayOffset: 7,
    label: "1주일 스타일 유지 팁",
    promptFocus: "일주일 후 볼륨과 결을 유지하는 주간 루틴, 열기구 사용 기준, 제품 사용량",
  },
  {
    contentType: "month1_revisit",
    dayOffset: 30,
    label: "한 달차 점검",
    promptFocus: "한 달 뒤 뿌리 볼륨, 끝 질감, 컬 또는 컬러 변화 점검과 보정 방문 권장",
  },
  {
    contentType: "month1_trend",
    dayOffset: 45,
    label: "시즌 트렌드 제안",
    promptFocus: "현재 스타일에서 자연스럽게 이어지는 다음 스타일 방향과 트렌드 키워드",
  },
  {
    contentType: "month3_cta",
    dayOffset: 90,
    label: "3개월차 새 스타일 제안",
    promptFocus: "3개월 뒤 스타일 변화 체크와 새 헤어스타일 미리보기 CTA",
  },
];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildGuideContext(guide?: AftercareGuide | null) {
  if (!guide) return "";

  return `
[페이지용 에프터케어 요약]
- 전체 요약: ${guide.overview.summary}
- 드라이: ${guide.sections.dry.steps.join(" / ")}
- 트리트먼트: ${guide.sections.treatment.steps.join(" / ")}
- 고데기: ${guide.sections.iron.steps.join(" / ")}
- 스타일링: ${guide.sections.styling.steps.join(" / ")}
`.trim();
}

function buildPrompt(input: GenerateHairCareInput, schedule: ScheduleItem) {
  const guideContext = buildGuideContext(input.aftercareGuide);

  return `
당신은 헤어 전문가입니다. 아래 고객 정보를 바탕으로 예약 발송용 이메일 콘텐츠를 작성하세요.

[고객 정보]
- 시술: ${input.styleName} (${SERVICE_TYPE_KO[input.serviceType]})
- 시술일: ${input.serviceDate}
- 발송 시점: 시술 후 ${schedule.dayOffset}일차
- 이메일 유형: ${schedule.label}
${guideContext ? `\n${guideContext}` : ""}

[작성 초점]
${schedule.promptFocus}

[출력 형식]
반드시 JSON만 반환하세요.
{
  "subject": "이메일 제목",
  "bodyHtml": "모바일 친화 HTML"
}

bodyHtml 규칙:
- 최상위 div는 max-width:600px, margin:0 auto, font-family:-apple-system,Arial,sans-serif 사용
- 핵심 내용은 ul/li 또는 짧은 문단으로 구성
- CTA 링크는 href="{{CTA_URL}}"를 사용
- 마지막에 HairStyle 스타일 케어 알림 푸터 포함
`.trim();
}

function cleanJsonResponse(text: string) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

async function generateSingleContent(
  input: GenerateHairCareInput,
  schedule: ScheduleItem,
  model: ReturnType<InstanceType<typeof GoogleGenerativeAI>["getGenerativeModel"]>,
): Promise<HairCareContentItem> {
  const result = await model.generateContent(buildPrompt(input, schedule));
  const parsed = JSON.parse(cleanJsonResponse(result.response.text())) as {
    subject?: unknown;
    bodyHtml?: unknown;
  };

  return {
    contentType: schedule.contentType,
    dayOffset: schedule.dayOffset,
    subject: typeof parsed.subject === "string" && parsed.subject.trim()
      ? parsed.subject.trim()
      : `[HairStyle] ${input.styleName} ${schedule.label}`,
    bodyHtml: typeof parsed.bodyHtml === "string" && parsed.bodyHtml.trim()
      ? parsed.bodyHtml.trim()
      : buildFallbackContent(input, schedule).bodyHtml,
  };
}

function buildFallbackContent(input: GenerateHairCareInput, schedule: ScheduleItem): HairCareContentItem {
  const section =
    schedule.contentType === "dry_guide"
      ? input.aftercareGuide?.sections.dry
      : schedule.contentType === "day3_care"
        ? input.aftercareGuide?.sections.treatment
        : schedule.contentType === "week1_tip"
          ? input.aftercareGuide?.sections.styling
          : null;
  const steps = section?.steps?.length
    ? section.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")
    : `<li>${escapeHtml(input.styleName)} 시술 후 ${schedule.dayOffset}일차 관리 상태를 확인하세요.</li>`;

  return {
    contentType: schedule.contentType,
    dayOffset: schedule.dayOffset,
    subject: `[HairStyle] ${input.styleName} ${schedule.label}`,
    bodyHtml: `<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7">
      <h2 style="font-size:20px;font-weight:700;margin:0 0 12px">${escapeHtml(schedule.label)}</h2>
      <p>${escapeHtml(input.styleName)} 에프터케어 가이드를 준비했습니다.</p>
      <ul style="padding-left:18px;margin:8px 0">${steps}</ul>
      <a href="{{CTA_URL}}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-top:16px">에프터케어 확인하기</a>
      <p style="margin-top:24px;font-size:12px;color:#9ca3af">HairStyle · 스타일 케어 알림</p>
    </div>`,
  };
}

export async function generateHairCareContents(input: GenerateHairCareInput): Promise<HairCareContentItem[]> {
  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    return SCHEDULE.map((schedule) => buildFallbackContent(input, schedule));
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      maxOutputTokens: 1500,
    },
  });

  const results = await Promise.allSettled(
    SCHEDULE.map((schedule) => generateSingleContent(input, schedule, model)),
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const schedule = SCHEDULE[index];
    console.error(`[hair-care-generator] ${schedule.contentType} generation failed:`, result.reason);
    return buildFallbackContent(input, schedule);
  });
}
