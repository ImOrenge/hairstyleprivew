import { render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { AccessibilityInfo, Animated } from "react-native";
import {
  FaceScanOverlay,
  PersonalColorDiagnosisProgress,
  PersonalColorSwatchAnalysisColumn,
} from "../components/PersonalColorDiagnosisProgress";

describe("personal color progress accessibility", () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("keeps animations static when the OS requests reduced motion", async () => {
    const loop = jest.spyOn(Animated, "loop");
    const view = await render(
      <>
        <FaceScanOverlay active />
        <PersonalColorDiagnosisProgress />
        <PersonalColorSwatchAnalysisColumn />
      </>,
    );

    await waitFor(() => {
      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(3);
    });
    expect(loop).not.toHaveBeenCalled();
    view.unmount();
  });

  test("labels real progress and identifies decorative analysis as a preview", async () => {
    const view = await render(
      <>
        <PersonalColorDiagnosisProgress />
        <PersonalColorSwatchAnalysisColumn />
      </>,
    );
    await waitFor(() => {
      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();
    });

    expect(screen.getByRole("progressbar").props.accessibilityValue.text)
      .toBe("얼굴 톤 기준점을 잡는 중");
    const hidden = { includeHiddenElements: true };
    expect(screen.queryByText("Analysis Preview", hidden)).toBeNull();
    expect(screen.getAllByText("팔레트 비교 과정", hidden).length).toBeGreaterThan(0);
    expect(screen.getByText(
      "움직이는 막대는 분석 과정을 설명하는 시각화이며 실제 측정 점수가 아닙니다.",
      hidden,
    ))
      .toBeOnTheScreen();
    expect(screen.queryByText("Live Swatch Matrix", hidden)).not.toBeOnTheScreen();
    expect(screen.queryByText("스와처값 계산", hidden)).not.toBeOnTheScreen();
    view.unmount();
  });
});
