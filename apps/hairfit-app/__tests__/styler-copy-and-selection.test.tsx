import type { GeneratedVariant, HairstyleGenerationGroup, StyleProfile } from "@hairfit/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { AccessibilityInfo } from "react-native";
import { MobileStylerHairSelectionModal } from "../components/styler/MobileStylerHairSelectionModal";
import {
  formatMobileStylerBodyShape,
  formatMobileStylerCorrectionFocus,
  formatMobileStylerExposure,
  formatMobileStylerFaceShape,
  formatMobileStylerFit,
  formatMobileStylerLength,
  formatMobileStylerPersonalColor,
  formatMobileStylerStatus,
  MOBILE_STYLER_GENRES,
} from "../components/styler/mobileStylerModel";

jest.mock("@hairfit/ui-native", () => jest.requireActual("../../../packages/ui-native/src/index"));
const mockTranslateResultCopy = jest.fn().mockRejectedValue(new Error("translation unavailable"));
jest.mock("../lib/api", () => ({
  useHairfitApi: () => ({ translateResultCopy: mockTranslateResultCopy }),
}));

const completedVariant: GeneratedVariant = {
  id: "variant-completed",
  rank: 1,
  label: "내추럴 레이어드",
  reason: "얼굴선을 부드럽게 정돈합니다.",
  prompt: "prompt",
  negativePrompt: "negative",
  tags: [],
  lengthBucket: "medium",
  correctionFocus: "jawline",
  status: "completed",
  outputUrl: "https://example.com/hair.webp",
  generatedImagePath: "private/hair.webp",
  evaluation: null,
  designerBrief: null,
  error: null,
  generatedAt: "2026-07-17T01:00:00.000Z",
};

const failedVariant: GeneratedVariant = {
  ...completedVariant,
  id: "variant-failed",
  label: "생성 실패 후보",
  status: "failed",
  outputUrl: null,
  generatedImagePath: null,
};

const alternateCompletedVariant: GeneratedVariant = {
  ...completedVariant,
  id: "variant-alternate",
  label: "소프트 허쉬컷",
  outputUrl: "https://example.com/hair-alternate.webp",
  generatedImagePath: "private/hair-alternate.webp",
};

const group: HairstyleGenerationGroup = {
  id: "generation-1",
  createdAt: "2026-07-17T01:00:00.000Z",
  status: "completed",
  selectedVariantId: completedVariant.id,
  analysis: {
    faceShape: "타원형",
    headShape: "균형형",
    foreheadExposure: "보통",
    observedPartingShape: "가르마",
    recommendedPartingShape: "6:4",
    partingStrategy: "균형",
    balance: "균형",
    bestLengthStrategy: "미디엄",
    volumeFocus: [],
    avoidNotes: [],
    summary: "균형 잡힌 얼굴형",
  },
  variants: [completedVariant, alternateCompletedVariant, failedVariant],
};

describe("mobile Styler Korean copy contracts", () => {
  test("formats profile and result values without raw English enum labels", () => {
    expect(formatMobileStylerLength("medium")).toBe("미디엄");
    expect(formatMobileStylerBodyShape("inverted_triangle")).toBe("역삼각형");
    expect(formatMobileStylerFit("relaxed")).toBe("여유 있는 핏");
    expect(formatMobileStylerExposure("balanced")).toBe("균형 있게");
    expect(formatMobileStylerCorrectionFocus("jawline")).toBe("턱선 보완");
    expect(formatMobileStylerFaceShape("heart-shaped")).toBe("하트형");
    expect(formatMobileStylerStatus("queued")).toBe("대기 중");
    expect(MOBILE_STYLER_GENRES.every((genre) => !/[A-Z]/.test(genre.label))).toBe(true);
  });

  test("formats saved personal color in Korean", () => {
    const profile = {
      personalColor: { tone: "warm", contrast: "high" },
    } as StyleProfile;

    expect(formatMobileStylerPersonalColor(profile)).toBe("웜톤 · 고대비");
    expect(formatMobileStylerPersonalColor(null)).toBe("진단 결과 없음");
  });
});

describe("MobileStylerHairSelectionModal", () => {
  beforeEach(() => {
    mockTranslateResultCopy.mockClear();
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("announces Korean states and selects only a completed result", async () => {
    const onClose = jest.fn();
    const onSelect = jest.fn();
    const view = await render(
      <MobileStylerHairSelectionModal
        error={null}
        groups={[group]}
        isLoading={false}
        onClose={onClose}
        onSelect={onSelect}
        open
        selectedVariantId={completedVariant.id}
      />,
    );

    expect(screen.getByText("최근 완성 결과에서 하나를 선택하세요")).toBeOnTheScreen();
    expect(screen.getByText(/얼굴형: 타원형 · 상태: 완료/)).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.getByTestId("styler-hair-selection-modal").props.animationType).toBe("slide");
    });
    expect(screen.getByText("실패")).toBeOnTheScreen();
    const selected = screen.getByRole("button", { name: "내추럴 레이어드, 선택됨" });
    expect(selected).toBeSelected();
    await fireEvent.press(selected);
    expect(onSelect).toHaveBeenCalledWith(group.id, completedVariant);

    await fireEvent.press(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  test("keeps selection state current when a virtualized result list rerenders", async () => {
    const props = {
      error: null,
      groups: [group],
      isLoading: false,
      onClose: jest.fn(),
      onSelect: jest.fn(),
      open: true,
    };
    const view = await render(
      <MobileStylerHairSelectionModal
        {...props}
        selectedVariantId={completedVariant.id}
      />,
    );

    expect(screen.getByRole("button", { name: "내추럴 레이어드, 선택됨" })).toBeSelected();
    expect(screen.getByRole("button", { name: "소프트 허쉬컷" })).not.toBeSelected();

    await view.rerender(
      <MobileStylerHairSelectionModal
        {...props}
        selectedVariantId={alternateCompletedVariant.id}
      />,
    );

    expect(screen.getByRole("button", { name: "내추럴 레이어드" })).not.toBeSelected();
    expect(screen.getByRole("button", { name: "소프트 허쉬컷, 선택됨" })).toBeSelected();
    view.unmount();
  });

  test("shows an explicit safe error in the modal", async () => {
    const view = await render(
      <MobileStylerHairSelectionModal
        error="최근 헤어스타일 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
        groups={[]}
        isLoading={false}
        onClose={jest.fn()}
        onSelect={jest.fn()}
        open
        selectedVariantId=""
      />,
    );

    expect(screen.getByText(/최근 헤어스타일 결과를 불러오지 못했습니다/)).toBeOnTheScreen();
    view.unmount();
  });

  test("never exposes English-only model copy when translation is unavailable", async () => {
    const englishVariant: GeneratedVariant = {
      ...completedVariant,
      id: "variant-english-copy",
      label: "Soft layered cut",
      reason: "Balances the face shape with natural volume.",
    };
    const englishGroup = { ...group, variants: [englishVariant] };
    const view = await render(
      <MobileStylerHairSelectionModal
        error={null}
        groups={[englishGroup]}
        isLoading={false}
        onClose={jest.fn()}
        onSelect={jest.fn()}
        open
        selectedVariantId=""
      />,
    );

    expect(screen.getByText("추천 스타일 1")).toBeOnTheScreen();
    expect(screen.getByText("얼굴형과 전체 균형을 고려한 추천 스타일입니다.")).toBeOnTheScreen();
    expect(screen.queryByText("Soft layered cut")).not.toBeOnTheScreen();
    expect(screen.queryByText("Balances the face shape with natural volume.")).not.toBeOnTheScreen();
    await waitFor(() => expect(mockTranslateResultCopy).toHaveBeenCalled());
    view.unmount();
  });

  test("removes the slide animation when the operating system requests reduced motion", async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    const view = await render(
      <MobileStylerHairSelectionModal
        error={null}
        groups={[group]}
        isLoading={false}
        onClose={jest.fn()}
        onSelect={jest.fn()}
        open
        selectedVariantId=""
      />,
    );

    await waitFor(() => {
      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();
      expect(screen.getByTestId("styler-hair-selection-modal").props.animationType).toBe("none");
    });
    view.unmount();
  });
});
