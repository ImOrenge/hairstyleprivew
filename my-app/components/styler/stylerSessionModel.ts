import type {
  PaidActionExecutionReceipt,
  StylingGenerateApiResponse,
  StylingQuoteApiResponse,
  StylingSessionApiResponse,
  StylingSessionDetails,
} from "@hairfit/shared";
import type {
  FashionGenre,
} from "../../lib/fashion-types";

export type WebStylingSessionDetails = StylingSessionDetails;

export interface WebStylingSessionPayload extends Omit<WebStylingSessionDetails, "creditReceipt"> {
  creditReceipt?: unknown;
}

export type WebStylingDetailsResponse = Omit<StylingSessionApiResponse, "session"> & {
  session?: WebStylingSessionPayload;
};
export type WebStylingQuoteResponse = StylingQuoteApiResponse;
export type WebStylingGenerateResponse = Omit<StylingGenerateApiResponse, "creditReceipt"> & {
  creditReceipt?: unknown;
};

export const WEB_STYLER_GENRE_LABELS: Record<FashionGenre, string> = {
  minimal: "미니멀",
  street: "스트릿",
  casual: "캐주얼",
  classic: "클래식",
  office: "오피스",
  date: "데이트",
  formal: "포멀",
  athleisure: "애슬레저",
};

export function formatWebStylerStatus(status: string) {
  if (status === "completed") return "완료";
  if (status === "generating") return "생성 중";
  if (status === "recommended") return "추천 완료";
  if (status === "failed") return "실패";
  return status;
}

export function formatWebStylerNotificationStatus(status?: string | null) {
  if (status === "sent") return "완료 이메일 발송됨";
  if (status === "pending" || status === "sending" || status === "retry_wait") {
    return "완료 이메일 발송 준비 중";
  }
  if (status === "skipped") return "계정 이메일을 확인할 수 없어 화면에서만 안내";
  if (status === "dead_letter" || status === "delivery_unknown") {
    return "이메일 상태 확인 필요 · 결과는 이 화면에서 확인 가능";
  }
  return null;
}

export function normalizeWebStylerReceipt(value: unknown): PaidActionExecutionReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const receipt = value as Partial<PaidActionExecutionReceipt>;
  if (
    receipt.action !== "outfit_generation" ||
    typeof receipt.executionId !== "string" ||
    typeof receipt.subjectId !== "string" ||
    !["reserved", "charged", "refunded", "free"].includes(receipt.state || "") ||
    typeof receipt.costCredits !== "number" ||
    typeof receipt.chargedCredits !== "number" ||
    typeof receipt.refundedCredits !== "number" ||
    typeof receipt.balanceAfter !== "number"
  ) {
    return null;
  }
  return receipt as PaidActionExecutionReceipt;
}

export function buildWebStylerSessionBillingHref(sessionId: string) {
  return `/billing?${new URLSearchParams({ returnTo: `/styler/${sessionId}` }).toString()}`;
}
