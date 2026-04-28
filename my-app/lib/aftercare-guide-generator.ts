import { GoogleGenerativeAI } from "@google/generative-ai";
import type { FaceAnalysisSummary, HairDesignerBrief } from "./recommendation-types";
import type { ServiceType } from "./hair-care-generator";

export type AftercareSectionKey = "dry" | "treatment" | "iron" | "styling";

export interface AftercareGuideSection {
  title: string;
  goal: string;
  timing: string;
  steps: string[];
  products: string[];
  avoid: string[];
}

export interface AftercareGuide {
  overview: {
    styleName: string;
    serviceType: ServiceType;
    headline: string;
    summary: string;
    serviceDate: string;
  };
  sections: Record<AftercareSectionKey, AftercareGuideSection>;
  maintenanceSchedule: Array<{
    dayOffset: number;
    label: string;
    description: string;
  }>;
  warnings: string[];
  recommendedNextActions: string[];
}

export interface GenerateAftercareGuideInput {
  styleName: string;
  serviceType: ServiceType;
  serviceDate: string;
  analysis?: FaceAnalysisSummary | null;
  designerBrief?: HairDesignerBrief | null;
}

const SERVICE_LABEL: Record<ServiceType, string> = {
  perm: "펌",
  color: "염색",
  cut: "커트",
  bleach: "탈색",
  treatment: "트리트먼트",
  other: "시술",
};

const SECTION_LABELS: Record<AftercareSectionKey, string> = {
  dry: "드라이 방법",
  treatment: "트리트먼트 관리",
  iron: "고데기 사용법",
  styling: "데일리 스타일링",
};

function nonEmptyStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function normalizeSection(
  raw: unknown,
  key: AftercareSectionKey,
  fallback: AftercareGuideSection,
): AftercareGuideSection {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  return {
    title: typeof source.title === "string" && source.title.trim() ? source.title.trim() : SECTION_LABELS[key],
    goal: typeof source.goal === "string" && source.goal.trim() ? source.goal.trim() : fallback.goal,
    timing: typeof source.timing === "string" && source.timing.trim() ? source.timing.trim() : fallback.timing,
    steps: nonEmptyStringArray(source.steps).slice(0, 6).length
      ? nonEmptyStringArray(source.steps).slice(0, 6)
      : fallback.steps,
    products: nonEmptyStringArray(source.products).slice(0, 5).length
      ? nonEmptyStringArray(source.products).slice(0, 5)
      : fallback.products,
    avoid: nonEmptyStringArray(source.avoid).slice(0, 5).length ? nonEmptyStringArray(source.avoid).slice(0, 5) : fallback.avoid,
  };
}

function buildFallbackGuide(input: GenerateAftercareGuideInput): AftercareGuide {
  const serviceLabel = SERVICE_LABEL[input.serviceType];
  const styleName = input.styleName.trim() || "선택한 헤어스타일";
  const volumeFocus = input.analysis?.volumeFocus?.join(", ") || "전체 밸런스";
  const salonKeywords = input.designerBrief?.salonKeywords?.slice(0, 3).join(", ") || styleName;

  return {
    overview: {
      styleName,
      serviceType: input.serviceType,
      headline: `${styleName} 에프터케어 가이드`,
      summary: `${serviceLabel} 후 형태가 오래 유지되도록 드라이 방향, 열기구 온도, 수분 보충 루틴을 함께 관리하세요. ${volumeFocus}를 기준으로 손질 강도를 조절하면 매일 비슷한 실루엣을 만들기 쉽습니다.`,
      serviceDate: input.serviceDate,
    },
    sections: {
      dry: {
        title: "드라이 방법",
        goal: "뿌리 방향과 끝 질감을 정리해 시술 직후의 실루엣을 유지합니다.",
        timing: "샴푸 후 물기가 70% 정도 마른 시점",
        steps: [
          "수건으로 비비지 말고 눌러서 물기를 제거합니다.",
          "두피 쪽부터 중간 바람으로 말려 뿌리 방향을 먼저 고정합니다.",
          `손가락으로 ${salonKeywords} 결을 따라 빗듯이 넘기며 전체 모양을 잡습니다.`,
          "끝부분은 찬바람으로 마무리해 부스스함을 줄입니다.",
        ],
        products: ["열 보호 미스트", "가벼운 에센스", "볼륨 브러시"],
        avoid: ["젖은 상태로 잠들기", "한 방향으로 강한 열을 오래 주기", "타월로 거칠게 비비기"],
      },
      treatment: {
        title: "트리트먼트 관리",
        goal: "수분과 단백질 균형을 맞춰 윤기와 탄력을 유지합니다.",
        timing: "주 2~3회, 샴푸 후",
        steps: [
          "모발 중간부터 끝까지 트리트먼트를 바르고 두피에는 과하게 묻히지 않습니다.",
          "3~5분 정도 둔 뒤 미지근한 물로 충분히 헹굽니다.",
          "건조함이 느껴지는 날에는 헤어팩을 1회 추가합니다.",
        ],
        products: ["수분 트리트먼트", "단백질 헤어팩", "리브인 에센스"],
        avoid: ["매일 무거운 헤어팩 사용", "뜨거운 물로 헹구기", "두피 가까이 오일을 많이 바르기"],
      },
      iron: {
        title: "고데기 사용법",
        goal: "열 손상을 줄이면서 필요한 컬과 방향만 보정합니다.",
        timing: "모발이 완전히 마른 뒤",
        steps: [
          "열 보호제를 먼저 바르고 완전히 흡수시킵니다.",
          "150~170도 범위에서 시작하고, 탈색/염색 모발은 더 낮게 설정합니다.",
          "한 섹션에 3초 이상 오래 머물지 않습니다.",
          "앞머리와 얼굴선 주변은 마지막에 약한 열로 정리합니다.",
        ],
        products: ["열 보호제", "집게핀", "마무리 세럼"],
        avoid: ["젖은 모발에 고데기 사용", "같은 구간 반복 집기", "고온으로 매일 전체 스타일링"],
      },
      styling: {
        title: "데일리 스타일링",
        goal: "아침 손질 시간을 줄이고 하루 동안 형태를 유지합니다.",
        timing: "외출 전 5~10분",
        steps: [
          "눌린 뿌리는 물 스프레이로 살짝 적신 뒤 다시 말립니다.",
          "볼륨이 필요한 구간만 브러시나 손으로 들어 올려 바람을 줍니다.",
          "끝 질감은 에센스나 크림을 소량만 덜어 가볍게 정리합니다.",
          "습한 날에는 가벼운 스프레이로 표면만 고정합니다.",
        ],
        products: ["컬 크림", "가벼운 왁스", "소프트 스프레이"],
        avoid: ["제품을 뿌리부터 많이 바르기", "오일과 왁스를 동시에 과하게 사용", "빗질로 컬을 완전히 풀기"],
      },
    },
    maintenanceSchedule: [
      { dayOffset: 1, label: "D+1", description: "샴푸와 드라이 강도를 낮추고 전체 방향을 확인합니다." },
      { dayOffset: 3, label: "D+3", description: "수분 트리트먼트를 시작하고 생활 습관으로 눌린 구간을 점검합니다." },
      { dayOffset: 7, label: "D+7", description: "고데기 온도와 데일리 제품 양을 조정합니다." },
      { dayOffset: 30, label: "D+30", description: "뿌리 볼륨과 끝 질감 변화를 보고 보정 또는 재방문을 검토합니다." },
    ],
    warnings: [
      "두피 자극, 심한 가려움, 끊어짐이 생기면 열기구와 염색 제품 사용을 중단하세요.",
      "펌, 탈색, 염색 직후에는 고온 스타일링 빈도를 줄이는 편이 안전합니다.",
      "제품은 한 번에 많이 바르기보다 소량씩 더하는 방식이 실패가 적습니다.",
    ],
    recommendedNextActions: [
      "오늘 샴푸 후 드라이 방향을 사진으로 기록해두세요.",
      "일주일 뒤 볼륨이 꺼지는 구간을 체크하세요.",
      "다음 스타일 변경 전 현재 길이와 질감 변화를 비교하세요.",
    ],
  };
}

function normalizeGuide(raw: unknown, input: GenerateAftercareGuideInput): AftercareGuide {
  const fallback = buildFallbackGuide(input);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fallback;
  }

  const source = raw as Record<string, unknown>;
  const overview = source.overview && typeof source.overview === "object" && !Array.isArray(source.overview)
    ? (source.overview as Record<string, unknown>)
    : {};
  const sections = source.sections && typeof source.sections === "object" && !Array.isArray(source.sections)
    ? (source.sections as Record<string, unknown>)
    : {};

  const maintenanceSchedule = Array.isArray(source.maintenanceSchedule)
    ? source.maintenanceSchedule
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const row = item as Record<string, unknown>;
          return {
            dayOffset: typeof row.dayOffset === "number" ? row.dayOffset : 0,
            label: typeof row.label === "string" ? row.label : "",
            description: typeof row.description === "string" ? row.description : "",
          };
        })
        .filter((item): item is AftercareGuide["maintenanceSchedule"][number] =>
          Boolean(item && item.dayOffset >= 0 && item.label && item.description),
        )
        .slice(0, 6)
    : [];

  return {
    overview: {
      ...fallback.overview,
      headline: typeof overview.headline === "string" && overview.headline.trim() ? overview.headline.trim() : fallback.overview.headline,
      summary: typeof overview.summary === "string" && overview.summary.trim() ? overview.summary.trim() : fallback.overview.summary,
    },
    sections: {
      dry: normalizeSection(sections.dry, "dry", fallback.sections.dry),
      treatment: normalizeSection(sections.treatment, "treatment", fallback.sections.treatment),
      iron: normalizeSection(sections.iron, "iron", fallback.sections.iron),
      styling: normalizeSection(sections.styling, "styling", fallback.sections.styling),
    },
    maintenanceSchedule: maintenanceSchedule.length ? maintenanceSchedule : fallback.maintenanceSchedule,
    warnings: nonEmptyStringArray(source.warnings).slice(0, 6).length
      ? nonEmptyStringArray(source.warnings).slice(0, 6)
      : fallback.warnings,
    recommendedNextActions: nonEmptyStringArray(source.recommendedNextActions).slice(0, 6).length
      ? nonEmptyStringArray(source.recommendedNextActions).slice(0, 6)
      : fallback.recommendedNextActions,
  };
}

function buildPrompt(input: GenerateAftercareGuideInput) {
  return `
당신은 헤어 디자이너가 고객에게 제공하는 사후관리 가이드를 만드는 전문가입니다.
아래 정보를 바탕으로 사용자가 페이지에서 바로 읽을 수 있는 에프터케어 JSON을 작성하세요.

[고객/스타일 정보]
- 스타일명: ${input.styleName}
- 시술유형: ${SERVICE_LABEL[input.serviceType]}
- 시술일: ${input.serviceDate}
- 얼굴/두상 분석: ${input.analysis?.summary ?? "정보 없음"}
- 디자이너 브리프: ${input.designerBrief?.consultationSummary ?? "정보 없음"}
- 스타일링 방향: ${input.designerBrief?.stylingDirection ?? "정보 없음"}

[출력 규칙]
- 반드시 JSON만 반환하세요.
- sections는 dry, treatment, iron, styling 네 개 key를 반드시 포함하세요.
- 각 section은 title, goal, timing, steps, products, avoid를 포함하세요.
- steps는 실천 가능한 한국어 문장 3~5개로 작성하세요.
- 과장된 의학적 표현은 피하고, 이상 증상은 전문가 상담을 권하세요.

{
  "overview": {
    "headline": "문자열",
    "summary": "문자열"
  },
  "sections": {
    "dry": { "title": "드라이 방법", "goal": "", "timing": "", "steps": [], "products": [], "avoid": [] },
    "treatment": { "title": "트리트먼트 관리", "goal": "", "timing": "", "steps": [], "products": [], "avoid": [] },
    "iron": { "title": "고데기 사용법", "goal": "", "timing": "", "steps": [], "products": [], "avoid": [] },
    "styling": { "title": "데일리 스타일링", "goal": "", "timing": "", "steps": [], "products": [], "avoid": [] }
  },
  "maintenanceSchedule": [{ "dayOffset": 1, "label": "D+1", "description": "문자열" }],
  "warnings": [],
  "recommendedNextActions": []
}
`.trim();
}

export async function generateAftercareGuide(input: GenerateAftercareGuideInput): Promise<AftercareGuide> {
  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    return buildFallbackGuide(input);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.45,
        maxOutputTokens: 2400,
      },
    });

    const result = await model.generateContent(buildPrompt(input));
    const text = result.response.text().trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return normalizeGuide(JSON.parse(cleaned), input);
  } catch (error) {
    console.error("[aftercare-guide-generator] fallback used:", error);
    return buildFallbackGuide(input);
  }
}
