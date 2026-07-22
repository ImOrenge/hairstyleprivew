import type { PaidActionQuote } from "@hairfit/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import GenerateScreen from "../app/generate";

const DRAFT_ID = "8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882";
const GENERATION_ID = "b6eb2e45-75c9-4b4b-8bd8-a55d7a47cbbb";
const PRIVATE_IMAGE_DATA_URL = "data:image/jpeg;base64,PRIVATE_PORTRAIT_SENTINEL";

const quote: PaidActionQuote = {
  quoteId: "signed-generation-quote",
  action: "hair_generation",
  subjectId: DRAFT_ID,
  billingScope: "customer",
  costCredits: 10,
  currentBalance: 40,
  balanceAfter: 30,
  shortfallCredits: 0,
  isFree: false,
  freeReason: null,
  isAllowed: true,
  issuedAt: "2026-07-18T00:00:00.000Z",
  expiresAt: "2026-07-19T23:59:00.000Z",
  policyVersion: "test",
  lockConsequence: null,
  failurePolicy: "실패하면 예약 크레딧을 복구합니다.",
};

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCreatePaidActionQuote = jest.fn();
const mockAcceptGenerationDraft = jest.fn();
const mockClear = jest.fn();

const mockApi = {
  acceptGenerationDraft: mockAcceptGenerationDraft,
  createPaidActionQuote: mockCreatePaidActionQuote,
};

const mockFlow = {
  clear: mockClear,
  draft: {
    generationId: "pre-accept-client-draft",
    imageDataUrl: PRIVATE_IMAGE_DATA_URL,
    recommendations: [],
  },
  draftReceipt: {
    draftId: DRAFT_ID,
    clientRequestId: "5c7baf42-e536-4ba6-8d57-5cb9a3e8c8e2",
    uploadedAt: "2026-07-18T00:00:00.000Z",
    expiresAt: "2026-07-19T23:59:00.000Z",
  },
  draftReceiptHydrated: true,
  imageDataUrl: PRIVATE_IMAGE_DATA_URL,
};

jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    signOut: jest.fn(),
    userId: "user_account_a",
  }),
  useUser: () => ({
    user: {
      emailAddresses: [{ emailAddress: "member@hairfit.test" }],
      firstName: "테스터",
      primaryEmailAddress: { emailAddress: "member@hairfit.test" },
    },
  }),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => false,
    push: mockPush,
    replace: mockReplace,
  }),
}));
jest.mock("../lib/api", () => ({ useHairfitApi: () => mockApi }));
jest.mock("../lib/generation-flow", () => ({ useGenerationFlow: () => mockFlow }));
jest.mock("../components/billing/PaidActionQuoteCard", () => ({
  PaidActionQuoteCard: () => null,
  useNativePaidActionQuoteExpired: () => false,
}));
jest.mock("../hooks/useSafeBackNavigation", () => ({
  useSafeBackNavigation: () => jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, props, children),
  };
});

describe("durable generation acceptance recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreatePaidActionQuote.mockResolvedValue({ quote });
    mockAcceptGenerationDraft
      .mockRejectedValueOnce(new TypeError("Network request failed after server commit"))
      .mockResolvedValueOnce({
        generationId: GENERATION_ID,
        acceptedAt: "2026-07-18T00:01:00.000Z",
        billingMode: "reserved_v1",
        creditReceipt: {
          reservationId: "123e4567-e89b-42d3-a456-426614174000",
          generationId: GENERATION_ID,
          billingScope: "recommendation_grid",
          policyVersion: "generation-grid-credit-v1",
          reservedCredits: 10,
          chargedCredits: 0,
          refundedCredits: 0,
          state: "reserved",
          reservedAt: "2026-07-18T00:01:00.000Z",
          chargedAt: null,
          refundedAt: null,
          balanceAfterReservation: 30,
          balanceAfterRefund: null,
          reservationLedgerId: "41",
          refundLedgerId: null,
          settlementReason: null,
        },
      });
  });

  test("retries the same draft after a lost accept response and clears portrait memory only after a receipt", async () => {
    const consoleMethods = ["log", "info", "warn", "error"] as const;
    const consoleSpies = consoleMethods.map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );

    try {
      await render(<GenerateScreen />);
      const acceptButton = await screen.findByRole("button", {
        name: "생성 접수 · 10크레딧 사용 예정",
      });

      await fireEvent.press(acceptButton);
      expect(
        await screen.findByText(
          "생성 작업을 접수하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.",
        ),
      ).toBeOnTheScreen();
      expect(mockAcceptGenerationDraft).toHaveBeenNthCalledWith(
        1,
        DRAFT_ID,
        quote.quoteId,
      );
      expect(mockClear).not.toHaveBeenCalled();

      const retryButton = screen.getByRole("button", {
        name: "생성 접수 · 10크레딧 사용 예정",
      });
      await waitFor(() => expect(retryButton).toBeEnabled());
      await fireEvent.press(retryButton);

      await waitFor(() => expect(mockAcceptGenerationDraft).toHaveBeenCalledTimes(2));
      expect(await screen.findByText("백그라운드 생성이 시작되었습니다")).toBeOnTheScreen();
      expect(mockAcceptGenerationDraft).toHaveBeenNthCalledWith(
        2,
        DRAFT_ID,
        quote.quoteId,
      );
      expect(mockClear).toHaveBeenCalledTimes(1);

      const logged = consoleSpies
        .flatMap((spy) => spy.mock.calls)
        .flat()
        .map(String)
        .join("\n");
      expect(logged).not.toContain(PRIVATE_IMAGE_DATA_URL);
      expect(logged).not.toContain("PRIVATE_PORTRAIT_SENTINEL");
    } finally {
      consoleSpies.forEach((spy) => spy.mockRestore());
    }
  });
});
