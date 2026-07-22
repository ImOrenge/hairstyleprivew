import type { PaidActionQuote } from "@hairfit/shared";
import {
  readFreshStylingQuote,
  readStylingQuoteErrorCode,
  stylingQuoteRefreshMessage,
} from "../lib/styling-paid-action";

const SESSION_ID = "8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882";

const quote: PaidActionQuote = {
  quoteId: "signed-quote",
  action: "outfit_generation",
  subjectId: SESSION_ID,
  billingScope: "customer",
  costCredits: 20,
  currentBalance: 100,
  balanceAfter: 80,
  shortfallCredits: 0,
  isFree: false,
  freeReason: null,
  isAllowed: true,
  issuedAt: "2026-07-15T12:00:00.000Z",
  expiresAt: "2026-07-15T12:05:00.000Z",
  policyVersion: "test",
  lockConsequence: null,
  failurePolicy: "실패하면 예약 크레딧을 복구합니다.",
};

describe("styling paid-action UI helpers", () => {
  test("accepts only an outfit quote bound to the current customer session", () => {
    expect(readFreshStylingQuote({ quote }, SESSION_ID)).toEqual(quote);
    expect(readFreshStylingQuote({ quote }, "9a5349dc-2c55-4ef2-87e3-d9ba7c038887")).toBeNull();
    expect(readFreshStylingQuote({ quote: { ...quote, action: "hair_generation" } }, SESSION_ID))
      .toBeNull();
    expect(readFreshStylingQuote({ quote: { ...quote, billingScope: "salon" } }, SESSION_ID))
      .toBeNull();
  });

  test("recognizes only quote recovery error codes", () => {
    expect(readStylingQuoteErrorCode({ code: "QUOTE_EXPIRED" })).toBe("QUOTE_EXPIRED");
    expect(readStylingQuoteErrorCode({ code: "STYLING_GENERATION_FAILED" })).toBeNull();
  });

  test("keeps an insufficient-credit recovery message explicit", () => {
    const insufficient = {
      ...quote,
      currentBalance: 5,
      balanceAfter: -15,
      shortfallCredits: 15,
      isAllowed: false,
    };
    expect(stylingQuoteRefreshMessage("INSUFFICIENT_CREDITS", insufficient))
      .toContain("15 부족");
  });
});
