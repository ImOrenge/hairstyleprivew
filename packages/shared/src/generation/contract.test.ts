import assert from "node:assert/strict";
import test from "node:test";
import { estimateHairstyleGenerations } from "../billing/policy-selectors.ts";
import {
  generationContractFixtures,
  hairstyleCreditEstimateFixtures,
} from "../fixtures/product-contract.ts";
import { generationSelectionFixtures } from "../fixtures/generation-selection.ts";
import { generationSelectionLockFixtures } from "../fixtures/generation-selection-lock.ts";
import {
  generationDestination,
  GENERATION_JOB_COPY,
  getGenerationJobRefreshLabel,
  getAllowedGenerationSelectionCommands,
  getConfirmedStyleVariantMediaSummary,
  getGenerationJobProgressPresentation,
  getGenerationVariantMediaSummary,
  getGenerationSummaryPresentation,
  getGenerationSelectionStage,
  getGenerationStatusPresentation,
  getGenerationVariantProgressSummary,
  isGenerationSelectionLocked,
  resolveGenerationResultSelection,
} from "./contract.ts";

test("generation progress copy and CTA labels stay platform-neutral", () => {
  assert.equal(getGenerationJobRefreshLabel(false), "진행 상태 새로고침");
  assert.equal(getGenerationJobRefreshLabel(true), "확인 중...");
  assert.equal(GENERATION_JOB_COPY.serverStageBasisKo, "시간 예상치가 아닌 서버 단계 기준입니다.");
  assert.equal(
    getGenerationVariantProgressSummary({
      totalVariantCount: 9,
      completedVariantCount: 3,
      failedVariantCount: 1,
    }),
    "전체 9개 · 완료 3개 · 실패 1개",
  );
  assert.equal(
    getGenerationVariantProgressSummary({
      totalVariantCount: 0,
      completedVariantCount: 0,
      failedVariantCount: 0,
    }),
    null,
  );
});

test("generation preparation states keep one web and native presentation matrix", () => {
  const acceptedAt = "2026-07-18T00:00:00.000Z";
  const cases = [
    {
      name: "queued",
      input: { status: "queued", acceptedAt, preparationStatus: "queued" as const, workflowDispatchStatus: "queued" as const },
      stage: "waiting",
      label: "예약 완료 · 서버 실행 대기",
    },
    {
      name: "preparing",
      input: { status: "queued", acceptedAt, preparationStatus: "preparing" as const, workflowDispatchStatus: "dispatched" as const },
      stage: "preparing",
      label: "사진 분석과 추천 보드 준비 중",
    },
    {
      name: "retry",
      input: { status: "queued", acceptedAt, preparationStatus: "retry" as const, workflowDispatchStatus: "retry" as const },
      stage: "waiting",
      label: "서버 실행 재시도 대기",
    },
    {
      name: "ready",
      input: { status: "processing", acceptedAt, preparationStatus: "ready" as const, workflowDispatchStatus: "dispatched" as const },
      stage: "generating",
      label: "헤어스타일 후보 생성 중",
    },
    {
      name: "failed",
      input: { status: "failed", acceptedAt, preparationStatus: "failed" as const, workflowDispatchStatus: "failed" as const },
      stage: "failed",
      label: "생성 작업 확인 필요",
    },
  ] as const;

  for (const scenario of cases) {
    const presentation = getGenerationJobProgressPresentation(scenario.input);
    assert.equal(presentation.stage, scenario.stage, scenario.name);
    assert.equal(presentation.labelKo, scenario.label, scenario.name);
    assert.equal(presentation.canLeave, true, scenario.name);
  }
});

test("confirmed style media follows the selected variant instead of the first generated image", () => {
  assert.deepEqual(
    getGenerationVariantMediaSummary({
      recommendationSet: {
        selectedVariantId: "variant-2",
        variants: [
          { id: "variant-1", label: "첫 번째", outputUrl: "https://example.com/one.jpg", status: "completed" },
          { id: "variant-2", label: "확정 스타일", outputUrl: "https://example.com/two.jpg", status: "completed" },
        ],
      },
    }),
    {
      selectedVariantId: "variant-2",
      selectedVariantLabel: "확정 스타일",
      selectedVariantImageUrl: "https://example.com/two.jpg",
      completedVariantCount: 2,
      totalVariantCount: 2,
    },
  );
});

test("confirmed style media is safe when legacy generation options are missing", () => {
  assert.deepEqual(getGenerationVariantMediaSummary(null), {
    selectedVariantId: null,
    selectedVariantLabel: null,
    selectedVariantImageUrl: null,
    completedVariantCount: 0,
    totalVariantCount: 0,
  });
});

test("confirmed style cards never present an arbitrary fallback image as the confirmed choice", () => {
  const media = getConfirmedStyleVariantMediaSummary({
    recommendationSet: {
      variants: [
        { id: "variant-1", label: "미확정 후보", outputUrl: "https://example.com/fallback.jpg" },
      ],
    },
  });

  assert.equal(media.selectedVariantId, null);
  assert.equal(media.selectedVariantLabel, null);
  assert.equal(media.selectedVariantImageUrl, null);
});

test("confirmed style cards prefer the public selected variant column over legacy options", () => {
  const media = getConfirmedStyleVariantMediaSummary(
    {
      recommendationSet: {
        selectedVariantId: "variant-1",
        variants: [
          { id: "variant-1", label: "과거 선택", outputUrl: "https://example.com/one.jpg" },
          { id: "variant-2", label: "시술 확정", outputUrl: "https://example.com/two.jpg" },
        ],
      },
    },
    "variant-2",
  );

  assert.equal(media.selectedVariantId, "variant-2");
  assert.equal(media.selectedVariantLabel, "시술 확정");
  assert.equal(media.selectedVariantImageUrl, "https://example.com/two.jpg");
});

test("confirmed style cards hide media when the selected variant is no longer present", () => {
  const media = getConfirmedStyleVariantMediaSummary(
    {
      recommendationSet: {
        variants: [
          { id: "variant-1", label: "다른 후보", outputUrl: "https://example.com/one.jpg" },
        ],
      },
    },
    "variant-missing",
  );

  assert.equal(media.selectedVariantId, "variant-missing");
  assert.equal(media.selectedVariantLabel, null);
  assert.equal(media.selectedVariantImageUrl, null);
});

test("selection fixtures keep query overrides and confirmation locking aligned", () => {
  for (const fixture of generationSelectionFixtures) {
    assert.deepEqual(resolveGenerationResultSelection(fixture.input), fixture.expected, fixture.name);
  }
});

test("generation job progress distinguishes a durable reservation from active generation", () => {
  const waiting = getGenerationJobProgressPresentation({
    status: "queued",
    acceptedAt: "2026-07-16T00:00:00.000Z",
    preparationStatus: "queued",
    workflowDispatchStatus: "queued",
  });
  assert.equal(waiting.stage, "waiting");
  assert.equal(waiting.labelKo, "예약 완료 · 서버 실행 대기");
  assert.equal(waiting.activeStepIndex, 1);
  assert.equal(waiting.canLeave, true);

  const generating = getGenerationJobProgressPresentation({
    status: "processing",
    acceptedAt: "2026-07-16T00:00:00.000Z",
    preparationStatus: "ready",
    workflowDispatchStatus: "dispatched",
    totalVariantCount: 9,
    completedVariantCount: 3,
    failedVariantCount: 1,
  });
  assert.equal(generating.stage, "generating");
  assert.match(generating.labelKo, /3개 준비됨/);
  assert.equal(generating.progressPercent > waiting.progressPercent, true);
  assert.equal(generating.progressPercent < 100, true);
});

test("generation job progress exposes dispatch failure without pretending the generation is terminal", () => {
  const presentation = getGenerationJobProgressPresentation({
    status: "queued",
    acceptedAt: "2026-07-16T00:00:00.000Z",
    preparationStatus: "queued",
    workflowDispatchStatus: "failed",
  });

  assert.equal(presentation.stage, "attention");
  assert.equal(presentation.terminal, false);
  assert.equal(presentation.tone, "danger");
});

test("generation status fixtures keep route and terminal meaning aligned", () => {
  for (const fixture of generationContractFixtures) {
    const presentation = getGenerationStatusPresentation(fixture.rawStatus);
    const destination = generationDestination({
      generationId: "generation-1",
      selectedVariantId: "variant-1",
      status: fixture.rawStatus,
    });

    assert.equal(presentation.status, fixture.expectedStatus, fixture.name);
    assert.equal(presentation.terminal, fixture.expectedTerminal, fixture.name);
    assert.equal(
      destination.startsWith(`/${fixture.expectedDestination}/`),
      true,
      fixture.name,
    );
  }
});

test("hairstyle estimates use the shared ten-credit policy", () => {
  for (const fixture of hairstyleCreditEstimateFixtures) {
    assert.equal(
      estimateHairstyleGenerations(fixture.credits, fixture.creditsPerGeneration),
      fixture.expected,
    );
  }
});

test("variant counts derive partial and failed display states from a terminal DB status", () => {
  const partial = getGenerationSummaryPresentation({
    status: "completed",
    completedVariantCount: 4,
    totalVariantCount: 9,
  });
  assert.equal(partial.status, "partial");
  assert.equal(
    generationDestination({
      generationId: "generation-1",
      status: "completed",
      completedVariantCount: 4,
      totalVariantCount: 9,
    }),
    "/generate/generation-1",
  );

  assert.equal(
    getGenerationSummaryPresentation({
      status: "completed",
      completedVariantCount: 0,
      totalVariantCount: 9,
    }).status,
    "failed",
  );
});

test("styling status does not reuse generation queue semantics", async () => {
  const { getStylingSessionStatusPresentation } = await import("../styling/contract.ts");
  assert.deepEqual(getStylingSessionStatusPresentation("recommended"), {
    status: "recommended",
    labelKo: "추천 준비됨",
    tone: "accent",
  });
});

test("confirmation is the only selection lock source", () => {
  for (const fixture of generationSelectionLockFixtures) {
    assert.equal(
      isGenerationSelectionLocked(fixture.input.confirmedHairRecord),
      fixture.expectedLocked,
      fixture.name,
    );
    assert.equal(getGenerationSelectionStage(fixture.input), fixture.expectedStage, fixture.name);
    assert.deepEqual(
      getAllowedGenerationSelectionCommands(fixture.input),
      fixture.expectedCommands,
      fixture.name,
    );
  }
});
