// 헤어케어 이메일 콘텐츠 AI 생성기
// 시술 확정 시점에 Gemini Flash로 6개 이메일을 사전 생성해 DB에 저장합니다.

import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── 타입 ──────────────────────────────────────────────────────────────────

export type ServiceType = "perm" | "color" | "cut" | "bleach" | "treatment" | "other";
export type ContentType =
  | "dry_guide"       // D+1
  | "day3_care"       // D+3
  | "week1_tip"       // D+7
  | "month1_revisit"  // D+30
  | "month1_trend"    // D+45
  | "month3_cta";     // D+90

export interface HairCareContentItem {
  contentType: ContentType;
  dayOffset: number;
  subject: string;
  bodyHtml: string;
}

export interface GenerateHairCareInput {
  styleName: string;
  serviceType: ServiceType;
  serviceDate: string; // YYYY-MM-DD
}

// ─── 시술 유형별 기본 재방문 권장일 ─────────────────────────────────────────

export const DEFAULT_NEXT_VISIT_DAYS: Record<ServiceType, number> = {
  perm:      90,
  color:     45,
  bleach:    40,
  cut:       30,
  treatment: 30,
  other:     60,
};

// ─── 스케줄 정의 ───────────────────────────────────────────────────────────

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
    promptFocus: `
시술 당일~1일차에 집에서 처음 드라이할 때 필요한 정보:
- 드라이기 온도 설정 (고온/중온/저온 중 권장)
- 드라이 방향 (결 방향, 뿌리/끝 순서)
- 에센스·오일 도포 시점 (드라이 전 vs 후)
- 절대 피해야 할 행동 (과도한 열, 빗질 방향 등)
- 스타일이 무너졌을 때 빠른 복구 방법 1가지
실용적인 팁 중심, 번호 목록 형태.
    `.trim(),
  },
  {
    contentType: "day3_care",
    dayOffset: 3,
    label: "3일차 케어 포인트",
    promptFocus: `
시술 후 3일째 중요한 케어 정보:
- 처음 세정 타이밍과 샴푸 선택 기준 (저자극 / 황산염 프리)
- 수분 공급 방법 (헤어 마스크, 딥 컨디셔너 사용 시점)
- 시술 유형에 따라 주의해야 할 생활 습관 (잠자리, 묶기 등)
- 스타일이 아직 안 잡혔을 때 대처법
따뜻한 조언 톤, 짧고 명확하게.
    `.trim(),
  },
  {
    contentType: "week1_tip",
    dayOffset: 7,
    label: "1주일 스타일 유지 팁",
    promptFocus: `
시술 1주일 후 스타일을 오래 유지하는 방법:
- 볼륨/컬/직모를 유지하는 주간 루틴 (세정 빈도, 제품 추천 유형)
- 자외선·습도·열 등 외부 요인 대처법
- 스타일이 서서히 변화하는 것이 정상임을 안심시키는 내용
- 다음 방문 전까지 혼자 관리하는 핵심 포인트 1가지
격려하는 톤, 실행 가능한 팁 중심.
    `.trim(),
  },
  {
    contentType: "month1_revisit",
    dayOffset: 30,
    label: "한 달 후 재방문 권장",
    promptFocus: `
시술 후 30일째, 슬슬 손질이 필요한 시점임을 알려주는 내용:
- 이 시점에 스타일이 어떻게 변했을지 자연스럽게 설명 (뿌리 자람, 볼륨 감소 등)
- 지금 상태에서 혼자 할 수 있는 간단한 손질법 1가지
- 터치업 vs 새 스타일 도전, 어떤 기준으로 결정할지
- 마지막에 자연스럽게 "새 스타일 미리보기"로 유도하는 문장 1줄
판매 느낌 없이, 친한 친구처럼 이야기하는 톤.
    `.trim(),
  },
  {
    contentType: "month1_trend",
    dayOffset: 45,
    label: "이번 시즌 트렌드 알림",
    promptFocus: `
시술 후 45일째, 이번 시즌 트렌드와 연결된 새 스타일 제안:
- 현재 확정한 스타일에서 자연스럽게 이어지는 다음 스타일 방향 1~2가지
- 계절감을 살린 트렌드 키워드 언급 (예: 웜톤 컬러, 가벼운 레이어 등)
- "지금 내 얼굴로 미리보기" 흐름으로 자연스럽게 연결
영감을 주는 톤, 이미지가 연상되도록 구체적으로.
    `.trim(),
  },
  {
    contentType: "month3_cta",
    dayOffset: 90,
    label: "3개월 후 새 스타일 CTA",
    promptFocus: `
시술 후 3개월째, 새 헤어스타일을 고민할 시점임을 알려주는 내용:
- "3개월이 지났어요" 자연스럽고 따뜻한 인사
- 이 기간 동안 스타일이 어떻게 변화했을지 공감하는 내용
- 새 스타일에 도전하기 좋은 이유 2가지 (계절 변화, 기분 전환 등)
- 강한 CTA: "지금 내 얼굴로 새 스타일 확인해보기"
설레임을 주는 톤, 너무 길지 않게 (150자 내외 본문).
    `.trim(),
  },
];

// ─── Gemini 호출 ───────────────────────────────────────────────────────────

const SERVICE_TYPE_KO: Record<ServiceType, string> = {
  perm:      "펌",
  color:     "염색",
  cut:       "커트",
  bleach:    "블리치",
  treatment: "트리트먼트",
  other:     "시술",
};

function buildPrompt(
  input: GenerateHairCareInput,
  schedule: ScheduleItem,
): string {
  const serviceKo = SERVICE_TYPE_KO[input.serviceType];
  return `
당신은 헤어 전문가입니다. 아래 고객 정보를 바탕으로 이메일 콘텐츠를 작성해주세요.

[고객 정보]
- 시술: ${input.styleName} (${serviceKo})
- 시술일: ${input.serviceDate}
- 발송 시점: 시술 후 ${schedule.dayOffset}일차
- 이메일 유형: ${schedule.label}

[작성 지침]
${schedule.promptFocus}

[출력 형식]
반드시 아래 JSON 형식으로만 응답하세요. 마크다운 코드블록 없이 순수 JSON:
{
  "subject": "이메일 제목 (50자 이내, 이모지 1개 포함)",
  "bodyHtml": "이메일 본문 HTML (인라인 스타일 사용, 모바일 친화적, 최대 600px 컨테이너, font-family: -apple-system, Arial, sans-serif)"
}

bodyHtml 작성 규칙:
- <div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"> 로 감싸기
- 제목은 <h2 style="font-size:20px;font-weight:700;margin:0 0 12px"> 사용
- 강조는 <strong> 사용
- 목록은 <ul style="padding-left:18px;margin:8px 0"> <li> 사용
- CTA 버튼: <a href="{{CTA_URL}}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-top:16px"> 사용
- 마지막에 <p style="margin-top:24px;font-size:12px;color:#9ca3af">HariStyle · 스타일 케어 알림</p> 푸터 포함
  `.trim();
}

async function generateSingleContent(
  input: GenerateHairCareInput,
  schedule: ScheduleItem,
  model: ReturnType<InstanceType<typeof GoogleGenerativeAI>["getGenerativeModel"]>,
): Promise<HairCareContentItem> {
  const prompt = buildPrompt(input, schedule);

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // JSON 파싱 (코드블록 제거 후 시도)
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: { subject: string; bodyHtml: string };
  try {
    parsed = JSON.parse(cleaned) as { subject: string; bodyHtml: string };
  } catch {
    // 파싱 실패 시 폴백: 기본 템플릿 사용
    parsed = {
      subject: `[HariStyle] ${schedule.label} — ${input.styleName}`,
      bodyHtml: `<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 12px">${schedule.label}</h2>
        <p>${input.styleName} 시술 후 ${schedule.dayOffset}일째 케어 가이드를 준비했습니다.</p>
        <a href="{{CTA_URL}}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-top:16px">앱에서 확인하기</a>
        <p style="margin-top:24px;font-size:12px;color:#9ca3af">HariStyle · 스타일 케어 알림</p>
      </div>`,
    };
  }

  return {
    contentType: schedule.contentType,
    dayOffset: schedule.dayOffset,
    subject: parsed.subject || `[HariStyle] ${schedule.label}`,
    bodyHtml: parsed.bodyHtml || "",
  };
}

// ─── 메인 함수 ─────────────────────────────────────────────────────────────

/**
 * 시술 유형과 스타일명을 받아 6개 케어 이메일 콘텐츠를 생성합니다.
 * 각 항목은 scheduled_send_at 계산을 위해 dayOffset을 포함합니다.
 */
export async function generateHairCareContents(
  input: GenerateHairCareInput,
): Promise<HairCareContentItem[]> {
  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing GOOGLE_API_KEY");

  const genAI = new GoogleGenerativeAI(apiKey);
  // Flash 모델: 속도 우선 (6개 병렬 생성)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      maxOutputTokens: 1500,
    },
  });

  // 6개 병렬 생성 (API rate limit 주의: 필요 시 sequential로 변경)
  const results = await Promise.allSettled(
    SCHEDULE.map((schedule) => generateSingleContent(input, schedule, model)),
  );

  return results.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    // 개별 실패 시 폴백
    const schedule = SCHEDULE[i];
    console.error(
      `[hair-care-generator] ${schedule.contentType} 생성 실패:`,
      result.reason,
    );
    return {
      contentType: schedule.contentType,
      dayOffset: schedule.dayOffset,
      subject: `[HariStyle] ${input.styleName} ${schedule.label}`,
      bodyHtml: `<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827">
        <p>${input.styleName} 케어 가이드 (${schedule.dayOffset}일차)</p>
        <a href="{{CTA_URL}}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-top:16px">앱에서 확인하기</a>
      </div>`,
    };
  });
}
