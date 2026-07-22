"use client";

import { useMemo, useState } from "react";
import type { FaceAnalysisSummary, GeneratedVariant } from "../../lib/recommendation-types";
import { ActionToolbar } from "../result/ActionToolbar";
import { ComparisonView } from "../result/ComparisonView";
import { SelectedVariantCard } from "../result/SelectedVariantCard";
import { VariantSwitcherGrid } from "../result/VariantSwitcherGrid";
import { Button } from "../ui/Button";
import { AppPage, Panel } from "../ui/Surface";

const variants: GeneratedVariant[] = [
  {
    id: "variant-1",
    rank: 1,
    label: "댄디 레이어드 컷",
    reason: "옆선을 정돈하고 정수리 볼륨을 살려 얼굴 비율을 안정적으로 보완합니다.",
    prompt: "",
    negativePrompt: "",
    tags: ["정수리 볼륨", "깔끔한 옆선"],
    lengthBucket: "short",
    correctionFocus: "crown",
    status: "completed",
    outputUrl: "/hero/demo/male-01.webp",
    generatedImagePath: null,
    evaluation: null,
    designerBrief: null,
    error: null,
    generatedAt: "2026-07-18T12:00:00.000Z",
  },
  {
    id: "variant-2",
    rank: 2,
    label: "소프트 투블럭",
    reason: "관자 부피를 가볍게 줄이고 앞머리 흐름을 자연스럽게 연결합니다.",
    prompt: "",
    negativePrompt: "",
    tags: ["부드러운 질감", "자연스러운 앞머리"],
    lengthBucket: "short",
    correctionFocus: "temple",
    status: "completed",
    outputUrl: "/hero/demo/male-02.webp",
    generatedImagePath: null,
    evaluation: null,
    designerBrief: null,
    error: null,
    generatedAt: "2026-07-18T12:00:00.000Z",
  },
  {
    id: "variant-3",
    rank: 3,
    label: "내추럴 가르마",
    reason: "이마 노출을 조절하면서 세로선을 분산해 편안한 인상을 만듭니다.",
    prompt: "",
    negativePrompt: "",
    tags: ["가르마", "내추럴"],
    lengthBucket: "medium",
    correctionFocus: "jawline",
    status: "completed",
    outputUrl: "/hero/demo/male-03.webp",
    generatedImagePath: null,
    evaluation: null,
    designerBrief: null,
    error: null,
    generatedAt: "2026-07-18T12:00:00.000Z",
  },
];

const analysis: FaceAnalysisSummary = {
  faceShape: "oval",
  headShape: "balanced",
  foreheadExposure: "medium",
  observedPartingShape: "natural",
  recommendedPartingShape: "soft-side",
  partingStrategy: "부드러운 옆가르마",
  balance: "균형형",
  bestLengthStrategy: "짧은 길이부터 중간 길이",
  volumeFocus: ["정수리"],
  avoidNotes: ["관자 과도한 부피"],
  summary: "정수리 볼륨과 부드러운 옆선을 중심으로 얼굴 비율을 보완했습니다.",
};

export function ResultDecisionStabilityHarness() {
  const [selectedVariantId, setSelectedVariantId] = useState("variant-1");
  const [selectionLocked, setSelectionLocked] = useState(false);
  const selectedVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedVariantId) || variants[0],
    [selectedVariantId],
  );

  return (
    <AppPage data-testid="result-decision-harness" className="flex flex-col gap-6 pb-32">
      <header>
        <p className="app-kicker">결과 의사결정 검증</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--app-text)]">내 헤어스타일 결과</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
          실제 결과 컴포넌트에서 선택, 확정 잠금, 비교와 고정 작업 영역을 확인합니다.
        </p>
      </header>

      <Panel as="section" aria-label="결과 상태 테스트 제어" className="flex flex-wrap gap-2 p-4">
        <Button type="button" onClick={() => setSelectionLocked(true)} disabled={selectionLocked}>
          현재 선택 확정 상태로 전환
        </Button>
        <Button type="button" variant="secondary" onClick={() => setSelectionLocked(false)} disabled={!selectionLocked}>
          선택 가능 상태로 복원
        </Button>
      </Panel>

      <ComparisonView
        beforeImage="/hero/demo/male-original.webp"
        afterImage={selectedVariant.outputUrl || "/hero/demo/male-01.webp"}
      />

      <SelectedVariantCard variant={selectedVariant} analysis={analysis} generationId="generation-e2e-result" />

      <VariantSwitcherGrid
        variants={variants}
        selectedVariantId={selectedVariantId}
        isSwitching={false}
        selectionLocked={selectionLocked}
        onRegenerate={() => setSelectionLocked(false)}
        onSelect={(variant) => setSelectedVariantId(variant.id)}
      />

      <ActionToolbar
        id="generation-e2e-result"
        outputImageUrl={selectedVariant.outputUrl}
        selectedVariantId={selectedVariantId}
        selectionLocked={selectionLocked}
        confirmedHairRecordId={selectionLocked ? "record-e2e-result" : null}
      />
    </AppPage>
  );
}
