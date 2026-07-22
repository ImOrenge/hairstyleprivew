import {
  generationDestination,
  getGenerationSummaryPresentation,
  type MobileBootstrap,
  type MobileDashboard,
  type MobileDashboardGeneration,
  type PersonalColorResult,
} from "@hairfit/shared";

export type MobileMyPageTabId =
  | "usage"
  | "plan"
  | "aftercare"
  | "personal-color"
  | "body-profile"
  | "account";

export type MobileCustomerDashboard = Extract<
  MobileDashboard,
  { service: "customer" }
>;

const tabIds: MobileMyPageTabId[] = [
  "usage",
  "plan",
  "aftercare",
  "personal-color",
  "body-profile",
  "account",
];

export const MOBILE_MY_PAGE_TABS: {
  id: MobileMyPageTabId;
  label: string;
}[] = [
  { id: "usage", label: "작업 현황" },
  { id: "plan", label: "플랜/결제" },
  { id: "aftercare", label: "시술 확정" },
  { id: "personal-color", label: "퍼스널컬러" },
  { id: "body-profile", label: "바디프로필" },
  { id: "account", label: "계정" },
];

export function normalizeMobileMyPageTab(value: unknown): MobileMyPageTabId {
  const first = Array.isArray(value) ? value[0] : value;
  return tabIds.includes(first as MobileMyPageTabId)
    ? (first as MobileMyPageTabId)
    : "usage";
}

export function getMobileMyPageTabHref(tab: MobileMyPageTabId) {
  return `/mypage?tab=${tab}` as const;
}

export function getMobileMyPageGenerationHref(
  item: MobileDashboardGeneration,
) {
  return generationDestination({
    generationId: item.id,
    selectedVariantId: item.selectedVariantId,
    status: item.status,
    completedVariantCount: item.completedVariantCount,
    totalVariantCount: item.totalVariantCount,
  });
}

export function formatMobileMyPageDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMobileMyPageKrw(value: number) {
  return `${value.toLocaleString("ko-KR")} KRW`;
}

export function formatMobileMyPagePlanLabel(
  planKey: string | null | undefined,
) {
  if (!planKey || planKey === "free") return "무료";
  if (planKey === "starter") return "스타터";
  if (planKey === "pro") return "프로";
  return planKey.charAt(0).toUpperCase() + planKey.slice(1);
}

export function formatMobileAccountType(
  accountType: MobileBootstrap["accountType"],
) {
  if (accountType === "admin") return "관리자";
  if (accountType === "salon_owner") return "살롱 관리자";
  if (accountType === "member") return "고객";
  return "미설정";
}

export function formatMobileService(
  service: MobileBootstrap["services"][number],
) {
  if (service === "admin") return "관리";
  if (service === "salon") return "살롱";
  return "고객";
}

export function formatMobileAccountSetup(
  value: boolean | null | undefined,
) {
  return value ? "완료" : "미완료";
}

export function getMobileGenerationPresentation(
  item: MobileDashboardGeneration,
) {
  return getGenerationSummaryPresentation({
    status: item.status,
    completedVariantCount: item.completedVariantCount,
    totalVariantCount: item.totalVariantCount,
  });
}

export function getMobileDisplayName(me: MobileBootstrap | null) {
  const name = me?.displayName?.trim();
  if (name) return name;
  const emailName = me?.email?.split("@")[0]?.trim();
  return emailName || "HairFit 사용자";
}

export function formatMobilePersonalColor(
  result: PersonalColorResult | null | undefined,
) {
  if (!result) return "진단 없음";
  const tone =
    result.tone === "warm"
      ? "웜톤"
      : result.tone === "cool"
        ? "쿨톤"
        : "뉴트럴";
  const contrast =
    result.contrast === "high"
      ? "높은 대비"
      : result.contrast === "low"
        ? "낮은 대비"
        : "중간 대비";
  return `${tone} / ${contrast}`;
}
