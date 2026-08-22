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
}

const SCHEDULE: ScheduleItem[] = [
  {
    contentType: "dry_guide",
    dayOffset: 1,
    label: "드라이 방법 가이드",
  },
  {
    contentType: "day3_care",
    dayOffset: 3,
    label: "3일차 케어 루틴",
  },
  {
    contentType: "week1_tip",
    dayOffset: 7,
    label: "1주일 스타일 유지 팁",
  },
  {
    contentType: "month1_revisit",
    dayOffset: 30,
    label: "한 달차 점검",
  },
  {
    contentType: "month1_trend",
    dayOffset: 45,
    label: "시즌 트렌드 제안",
  },
  {
    contentType: "month3_cta",
    dayOffset: 90,
    label: "3개월차 새 스타일 제안",
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
    subject: `HairFit | D+${schedule.dayOffset} ${input.styleName} 에프터케어`,
    bodyHtml: `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.aftercareGuide?.overview.summary || `${SERVICE_TYPE_KO[input.serviceType]} 후 관리 상태를 확인해 주세요.`)}</div><div style="max-width:600px;margin:0 auto;font-family:-apple-system,Arial,sans-serif;color:#111827;line-height:1.7"><p style="font-size:12px;font-weight:700;letter-spacing:.12em">HAIRFIT AFTERCARE</p><h2 style="font-size:20px;font-weight:700;margin:0 0 12px">${escapeHtml(schedule.label)}</h2><p>${escapeHtml(input.styleName)} 에프터케어 가이드를 준비했습니다.</p><ul style="padding-left:18px;margin:8px 0">${steps}</ul><a href="{{CTA_URL}}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 24px;font-weight:600;margin-top:16px">에프터케어 기록 확인</a><p style="margin-top:24px;font-size:12px;color:#6b7280">HairFit · 알림은 에프터케어 화면에서 일시정지할 수 있습니다.</p></div>`,
  };
}

export async function generateHairCareContents(input: GenerateHairCareInput): Promise<HairCareContentItem[]> {
  return SCHEDULE.map((schedule) => buildFallbackContent(input, schedule));
}
