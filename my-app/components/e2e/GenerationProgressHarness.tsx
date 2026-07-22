"use client";

import {
  getGenerationJobProgressPresentation,
  type GenerationJobProgressInput,
  type PipelineStage,
} from "@hairfit/shared";
import { useEffect, useRef, useState } from "react";
import { GenerationJobProgressCard } from "../generate/GenerationJobProgressCard";
import { PipelineStatusIndicator } from "../generate/PipelineStatusIndicator";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Surface";

const acceptedAt = "2026-07-18T00:00:00.000Z";

const scenarios = {
  queued: { status: "queued", acceptedAt, preparationStatus: "queued", workflowDispatchStatus: "queued" },
  preparing: { status: "queued", acceptedAt, preparationStatus: "preparing", workflowDispatchStatus: "dispatched" },
  retry: { status: "queued", acceptedAt, preparationStatus: "retry", workflowDispatchStatus: "retry" },
  ready: {
    status: "processing",
    acceptedAt,
    preparationStatus: "ready",
    workflowDispatchStatus: "dispatched",
    totalVariantCount: 9,
    completedVariantCount: 3,
    failedVariantCount: 1,
  },
  failed: { status: "failed", acceptedAt, preparationStatus: "failed", workflowDispatchStatus: "failed" },
} satisfies Record<string, GenerationJobProgressInput>;

type ScenarioKey = keyof typeof scenarios;

const pipelineScenarios = {
  queued: {
    stage: "idle",
    message: "사진 분석을 시작할 준비가 되었습니다.",
    error: null,
    progress: 0,
  },
  preparing: {
    stage: "analyzing_face",
    message: "얼굴형과 헤어 특징을 분석하고 있습니다.",
    error: null,
    progress: 35,
  },
  retry: {
    stage: "validating",
    message: "업로드한 사진을 다시 확인하고 있습니다.",
    error: null,
    progress: 15,
  },
  ready: {
    stage: "generating_image",
    message: "확정할 헤어스타일 후보를 생성하고 있습니다.",
    error: null,
    progress: 62,
  },
  failed: {
    stage: "failed",
    message: "생성 단계를 확인해 주세요.",
    error: "사진을 다시 확인한 뒤 재시도해 주세요.",
    progress: 62,
  },
} satisfies Record<
  ScenarioKey,
  { stage: PipelineStage; message: string; error: string | null; progress: number }
>;

export function GenerationProgressHarness() {
  const [scenario, setScenario] = useState<ScenarioKey>("queued");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const refreshTimerRef = useRef<number | null>(null);
  const presentation = getGenerationJobProgressPresentation(scenarios[scenario]);

  useEffect(() => () => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
  }, []);

  const refresh = () => {
    setRefreshing(true);
    refreshTimerRef.current = window.setTimeout(() => {
      setRefreshCount((count) => count + 1);
      setRefreshing(false);
      refreshTimerRef.current = null;
    }, 200);
  };

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-10">
      <Panel as="section" className="space-y-4 p-6">
        <p className="app-kicker">E2E 전용</p>
        <h1 className="text-3xl font-black text-[var(--app-text)]">운영 생성 진행 상태 검증</h1>
        <div className="flex flex-wrap gap-2" aria-label="검증할 서버 상태">
          {(Object.keys(scenarios) as ScenarioKey[]).map((key) => (
            <Button
              key={key}
              type="button"
              variant={scenario === key ? "primary" : "secondary"}
              aria-pressed={scenario === key}
              onClick={() => setScenario(key)}
            >
              {key}
            </Button>
          ))}
        </div>
      </Panel>

      <GenerationJobProgressCard
        presentation={presentation}
        lastCheckedAt={new Date(acceptedAt)}
        refreshing={refreshing}
        onRefresh={refresh}
      />
      <section className="grid gap-3" aria-labelledby="pipeline-status-title">
        <h2 id="pipeline-status-title" className="text-xl font-black text-[var(--app-text)]">
          세부 생성 단계
        </h2>
        <PipelineStatusIndicator {...pipelineScenarios[scenario]} />
      </section>
      <p role="status" aria-live="polite" className="text-sm text-[var(--app-muted)]">
        새로고침 요청 {refreshCount}회
      </p>
    </main>
  );
}
