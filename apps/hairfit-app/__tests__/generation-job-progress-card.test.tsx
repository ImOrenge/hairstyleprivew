import { fireEvent, render, screen } from "@testing-library/react-native";
import {
  GENERATION_JOB_COPY,
  getGenerationJobProgressPresentation,
} from "@hairfit/shared";
import React from "react";
import { GenerationJobProgressCard } from "../components/generation/GenerationJobProgressCard";

jest.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    signOut: jest.fn(),
    userId: "progress_test_user",
  }),
  useUser: () => ({ user: null }),
}));

test("native generation progress renders shared state copy and refresh interaction", async () => {
  const onRefresh = jest.fn();
  const presentation = getGenerationJobProgressPresentation({
    status: "processing",
    acceptedAt: "2026-07-18T00:00:00.000Z",
    preparationStatus: "ready",
    workflowDispatchStatus: "dispatched",
    totalVariantCount: 9,
    completedVariantCount: 3,
    failedVariantCount: 1,
  });

  await render(
    <GenerationJobProgressCard presentation={presentation} onRefresh={onRefresh} />,
  );

  expect(screen.getByText("헤어스타일 후보 생성 중 · 3개 준비됨")).toBeOnTheScreen();
  expect(screen.getByText(GENERATION_JOB_COPY.serverStageBasisKo)).toBeOnTheScreen();
  expect(screen.getByText("전체 9개 · 완료 3개 · 실패 1개")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: GENERATION_JOB_COPY.refreshLabelKo }));
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

test("native generation progress exposes the shared pending CTA state", async () => {
  const presentation = getGenerationJobProgressPresentation({
    status: "queued",
    acceptedAt: "2026-07-18T00:00:00.000Z",
    preparationStatus: "retry",
    workflowDispatchStatus: "retry",
  });

  await render(
    <GenerationJobProgressCard
      presentation={presentation}
      refreshing
      onRefresh={jest.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: GENERATION_JOB_COPY.refreshingLabelKo })).toBeDisabled();
});
