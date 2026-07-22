import { HairfitApiError } from "@hairfit/api-client";
import {
  normalizePaidActionQuote,
  type PaidActionQuote,
  type PaidActionQuoteErrorCode,
} from "@hairfit/shared";

const STYLING_QUOTE_ERROR_CODES = new Set<PaidActionQuoteErrorCode>([
  "QUOTE_REQUIRED",
  "QUOTE_INVALID",
  "QUOTE_EXPIRED",
  "QUOTE_CHANGED",
  "INSUFFICIENT_CREDITS",
]);

export function readStylingQuoteErrorCode(payload: unknown): PaidActionQuoteErrorCode | null {
  if (!payload || typeof payload !== "object" || !("code" in payload)) return null;
  const code = (payload as { code?: unknown }).code;
  return typeof code === "string" && STYLING_QUOTE_ERROR_CODES.has(code as PaidActionQuoteErrorCode)
    ? code as PaidActionQuoteErrorCode
    : null;
}

export function readFreshStylingQuote(payload: unknown, sessionId: string) {
  if (!payload || typeof payload !== "object" || !("quote" in payload)) return null;
  const quote = normalizePaidActionQuote((payload as { quote?: unknown }).quote);
  return quote?.action === "outfit_generation" &&
    quote.billingScope === "customer" &&
    quote.subjectId === sessionId
    ? quote
    : null;
}

export function stylingQuoteRequestErrorMessage(error: unknown) {
  if (error instanceof HairfitApiError) {
    if (error.status === 401) return "최신 견적을 확인하려면 다시 로그인해 주세요.";
    if (error.status === 403) return "현재 계정으로는 이 룩북 견적을 확인할 수 없습니다.";
    if (error.status === 404) return "패션 추천 세션을 찾을 수 없습니다.";
  }
  return "최신 크레딧 견적을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.";
}

export function stylingQuoteRefreshMessage(
  code: PaidActionQuoteErrorCode | null,
  quote: PaidActionQuote,
) {
  if (code === "INSUFFICIENT_CREDITS" || !quote.isAllowed) {
    return `크레딧이 ${quote.shortfallCredits} 부족합니다. 충전 후 최신 견적을 다시 확인해 주세요.`;
  }
  if (code === "QUOTE_EXPIRED") {
    return "견적 유효 시간이 지나 최신 견적을 불러왔습니다. 비용을 확인한 뒤 생성 버튼을 다시 눌러 주세요.";
  }
  if (code === "QUOTE_CHANGED") {
    return "잔액 또는 비용이 변경되어 최신 견적을 불러왔습니다. 내용을 확인한 뒤 생성 버튼을 다시 눌러 주세요.";
  }
  return "최신 크레딧 견적을 불러왔습니다. 잔액과 차감 후 잔액을 확인한 뒤 생성 버튼을 다시 눌러 주세요.";
}
