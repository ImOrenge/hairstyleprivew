import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const webCard = read("../components/generate/GenerationJobProgressCard.tsx");
const nativeCard = read("../../apps/hairfit-app/components/generation/GenerationJobProgressCard.tsx");
const pipelineIndicator = read("../components/generate/PipelineStatusIndicator.tsx");
const generationStore = read("../store/useGenerationStore.ts");
const sharedTypes = read("../../packages/shared/src/index.ts");
const globalStyles = read("../app/globals.css");
const harnessPage = read("../app/e2e-harness/progress/page.tsx");
const harness = read("../components/e2e/GenerationProgressHarness.tsx");

for (const [platform, source] of [["web", webCard], ["native", nativeCard]] as const) {
  test(`${platform} generation progress card consumes the shared copy and CTA contract`, () => {
    assert.match(source, /GENERATION_JOB_COPY/);
    assert.match(source, /getGenerationJobRefreshLabel\(refreshing\)/);
    assert.match(source, /getGenerationVariantProgressSummary\(presentation\)/);
    assert.doesNotMatch(source, />진행 상태 새로고침</);
    assert.doesNotMatch(source, />확인 중\.\.\.</);
  });
}

test("both generation progress cards announce updates without interrupting the user", () => {
  assert.match(webCard, /role="status"[\s\S]*aria-live="polite"/);
  assert.match(nativeCard, /accessibilityLiveRegion="polite"/);
});

test("web generation feedback exposes stable CSS, state, and accessibility contracts", () => {
  assert.match(webCard, /className="c-generation-job-progress"/);
  assert.match(webCard, /data-tone=\{presentation\.tone\}/);
  assert.match(webCard, /data-terminal=\{presentation\.terminal/);
  assert.match(webCard, /aria-busy=\{!presentation\.terminal/);
  assert.match(pipelineIndicator, /className=\{cn\("c-pipeline-status"/);
  assert.match(pipelineIndicator, /data-stage=\{stage\}/);
  assert.match(pipelineIndicator, /data-state=\{state\}/);
  assert.match(pipelineIndicator, /aria-valuetext=\{`\$\{STAGE_LABELS\[stage\]\} · \$\{displayProgress\}%`\}/);
  assert.match(globalStyles, /\.c-generation-job-progress\s*\{/);
  assert.match(globalStyles, /\.c-pipeline-status\s*\{/);
});

test("pipeline stages use the shared type and Korean user-facing labels", () => {
  assert.match(pipelineIndicator, /import type \{ PipelineStage \} from "@hairfit\/shared"/);
  assert.match(generationStore, /export type \{ PipelineStage \} from "@hairfit\/shared"/);
  assert.doesNotMatch(generationStore, /export type PipelineStage\s*=/);
  assert.match(sharedTypes, /export type PipelineStage\s*=/);
  assert.match(pipelineIndicator, /현재 단계:/);
  assert.match(pipelineIndicator, /처리 중/);
  assert.match(pipelineIndicator, /진행률/);
  assert.doesNotMatch(pipelineIndicator, /Current stage|Processing|>Progress/);
});

test("generation progress E2E harness is fail-closed and composes the production card", () => {
  assert.match(harnessPage, /process\.env\.E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(harnessPage, /notFound\(\)/);
  assert.match(harnessPage, /robots: \{ index: false, follow: false \}/);
  assert.match(harness, /<GenerationJobProgressCard/);
  assert.match(harness, /<PipelineStatusIndicator/);
  assert.match(harness, /getGenerationJobProgressPresentation/);
});
