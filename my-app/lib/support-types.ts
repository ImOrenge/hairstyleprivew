export const SUPPORT_POST_KINDS = ["review", "requirement", "suggestion", "bug"] as const;
export const SUPPORT_POST_STATUSES = ["received", "reviewing", "planned", "resolved", "on_hold"] as const;
export const SUPPORT_PUBLIC_TABS = ["faq", "all", ...SUPPORT_POST_KINDS] as const;

export type SupportPostKind = (typeof SUPPORT_POST_KINDS)[number];
export type SupportPostStatus = (typeof SUPPORT_POST_STATUSES)[number];
export type SupportPublicTab = (typeof SUPPORT_PUBLIC_TABS)[number];

export const SUPPORT_POST_KIND_LABELS: Record<SupportPostKind, string> = {
  review: "리뷰/불만",
  requirement: "요구사항",
  suggestion: "건의사항",
  bug: "버그 제보",
};

export const SUPPORT_POST_KIND_DESCRIPTIONS: Record<SupportPostKind, string> = {
  review: "서비스 이용 경험, 불만, 개선 요청을 공유합니다.",
  requirement: "꼭 필요하다고 느낀 기능 요구사항을 남깁니다.",
  suggestion: "더 나은 사용 흐름이나 운영 아이디어를 제안합니다.",
  bug: "오류 상황, 재현 방법, 기대 동작을 알려줍니다.",
};

export const SUPPORT_POST_STATUS_LABELS: Record<SupportPostStatus, string> = {
  received: "접수",
  reviewing: "검토중",
  planned: "반영예정",
  resolved: "해결",
  on_hold: "보류",
};

export const SUPPORT_POST_STATUS_CLASS_NAMES: Record<SupportPostStatus, string> = {
  received: "bg-stone-100 text-stone-700 ring-1 ring-stone-200",
  reviewing: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  planned: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  on_hold: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

export const SUPPORT_PUBLIC_TAB_LABELS: Record<SupportPublicTab, string> = {
  faq: "FAQ",
  all: "전체 게시글",
  review: SUPPORT_POST_KIND_LABELS.review,
  requirement: SUPPORT_POST_KIND_LABELS.requirement,
  suggestion: SUPPORT_POST_KIND_LABELS.suggestion,
  bug: SUPPORT_POST_KIND_LABELS.bug,
};

export function isSupportPostKind(value: unknown): value is SupportPostKind {
  return typeof value === "string" && SUPPORT_POST_KINDS.includes(value as SupportPostKind);
}

export function isSupportPostStatus(value: unknown): value is SupportPostStatus {
  return typeof value === "string" && SUPPORT_POST_STATUSES.includes(value as SupportPostStatus);
}

export function isSupportPublicTab(value: unknown): value is SupportPublicTab {
  return typeof value === "string" && SUPPORT_PUBLIC_TABS.includes(value as SupportPublicTab);
}

export function normalizeSupportPublicTab(value: unknown): SupportPublicTab {
  return isSupportPublicTab(value) ? value : "faq";
}

export function normalizeSupportPostKind(value: unknown): SupportPostKind {
  return isSupportPostKind(value) ? value : "suggestion";
}
