import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function occurrenceCount(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

test("workspace step navigation stays a plain-prop rendering boundary", () => {
  const wizard = read("../components/workspace/WorkspaceWizard.tsx");
  const navigation = read("../components/workspace/WorkspaceStepNavigation.tsx");

  assert.match(wizard, /<WorkspaceStepNavigation/);
  assert.doesNotMatch(wizard, /function StepButton|function MobileStepOverlay/);
  assert.match(navigation, /export type WorkspaceWizardStep = "upload" \| "generate" \| "progress" \| "select"/);
  assert.match(
    navigation,
    /label: "사진 업로드"[\s\S]*label: "생성 접수"[\s\S]*label: "생성 진행·알림"[\s\S]*label: "헤어 선택"/,
  );
  assert.match(navigation, /aria-current=\{active \? "step" : undefined\}/);
  assert.match(navigation, /aria-label="헤어스타일 생성 단계"/);
  assert.match(navigation, /onStepClick\(selectedStep\);[\s\S]*onToggle\(\);/);
  assert.match(navigation, /className="c-workspace-step-navigation"/);
  assert.doesNotMatch(
    navigation,
    /useGenerationStore|useGenerate|useUpload|useRouter|useSearchParams|\bfetch\(/,
  );
});

test("workspace generation and variant views stay plain-prop boundaries", () => {
  const wizard = read("../components/workspace/WorkspaceWizard.tsx");
  const acceptedStatus = read(
    "../components/workspace/WorkspaceAcceptedGenerationStatus.tsx",
  );
  const generationSubmission = read(
    "../components/workspace/WorkspaceGenerationSubmission.tsx",
  );
  const variantSelection = read(
    "../components/workspace/WorkspaceVariantSelection.tsx",
  );

  assert.match(wizard, /<WorkspaceAcceptedGenerationStatus/);
  assert.match(wizard, /<WorkspaceGenerationSubmission/);
  assert.match(wizard, /<WorkspaceVariantSelection/);
  assert.doesNotMatch(wizard, /function VariantCard|function statusTone/);
  assert.match(acceptedStatus, /백그라운드 생성이 시작되었습니다/);
  assert.match(acceptedStatus, /className="c-workspace-accepted-status"/);
  assert.match(acceptedStatus, /aria-labelledby="workspace-accepted-status-title"/);
  assert.match(acceptedStatus, /role="status"[\s\S]*aria-live="polite"[\s\S]*aria-atomic="true"/);
  assert.doesNotMatch(acceptedStatus, /<SurfaceCard[^>]*role="status"/);
  assert.match(generationSubmission, /사진 업로드 다시 시도/);
  assert.match(variantSelection, /aria-pressed=\{isSelected\}/);
  assert.match(variantSelection, /헤어 선택 및 다음 작업/);
  for (const view of [
    acceptedStatus,
    generationSubmission,
    variantSelection,
  ]) {
    assert.doesNotMatch(
      view,
      /useGenerationStore|useGenerate|useUpload|useRouter|useSearchParams|\bfetch\(/,
    );
  }
});

test("workspace flow E2E harness is fail-closed and composes production boundaries", () => {
  const harnessPage = read("../app/e2e-harness/workspace-flow/page.tsx");
  const harness = read("../components/e2e/WorkspaceFlowHarness.tsx");

  assert.match(harnessPage, /process\.env\.E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(harnessPage, /notFound\(\)/);
  assert.match(harnessPage, /robots: \{ index: false, follow: false \}/);
  assert.match(harness, /<WorkspaceStepNavigation/);
  assert.match(harness, /<WorkspaceAcceptedGenerationStatus/);
  assert.match(harness, /getGenerationJobProgressPresentation/);
});

test("10D-1 extraction preserves customer workspace command ownership", () => {
  const wizard = read("../components/workspace/WorkspaceWizard.tsx");
  const controller = read(
    "../components/workspace/useCustomerGenerationController.ts",
  );
  const adapter = read(
    "../components/workspace/customerGenerationAdapter.ts",
  );

  assert.doesNotMatch(
    wizard,
    /useGenerationStore|useGenerate|useUpload|useRouter|useSearchParams|\bfetch\(|\brunGridPipeline\(\)/,
  );
  assert.match(wizard, /useCustomerGenerationController\(\)/);
  assert.equal(occurrenceCount(controller, /useGenerationStore\(/g), 1);
  assert.match(controller, /useShallow\(\(state\) => \(\{/);
  assert.equal(occurrenceCount(controller, /\brunGridPipeline\(\)/g), 1);
  assert.doesNotMatch(controller, /\bfetch\(/);
  assert.match(controller, /setCurrentStep\("progress"\)/);
  assert.match(controller, /setCurrentStep\("select"\)/);
  assert.equal(occurrenceCount(adapter, /\bfetch\(/g), 2);
  assert.match(adapter, /fetch\("\/api\/style-profile"/);
  assert.match(
    adapter,
    /`\/api\/generations\/\$\{encodeURIComponent\(input\.generationId\)\}`/,
  );
  assert.doesNotMatch(
    adapter,
    /useGenerationStore|useGenerate|useUpload|useRouter|useSearchParams|from "react"/,
  );
});

test("salon workspace views stay plain-prop rendering boundaries", () => {
  const wizard = read("../components/salon/SalonWorkspaceWizard.tsx");
  const navigation = read(
    "../components/salon/SalonWorkspaceStepNavigation.tsx",
  );
  const variantGrid = read(
    "../components/salon/SalonWorkspaceVariantGrid.tsx",
  );

  assert.match(wizard, /<SalonWorkspaceStepNavigation/);
  assert.match(wizard, /<SalonWorkspaceVariantGrid/);
  assert.doesNotMatch(wizard, /function StepButton|function VariantCard/);
  assert.match(
    navigation,
    /label: "고객 사진"[\s\S]*label: "생성 접수"[\s\S]*label: "생성 진행"[\s\S]*label: "CRM 저장"/,
  );
  assert.match(variantGrid, /aria-pressed=\{isSelected\}/);

  for (const view of [navigation, variantGrid]) {
    assert.doesNotMatch(
      view,
      /useAdminReadOnly|useUpload|useRouter|usePaidActionQuoteExpired|\bfetch\(/,
    );
  }
});

test("10D-2 extraction preserves salon generation and CRM command ownership", () => {
  const wizard = read("../components/salon/SalonWorkspaceWizard.tsx");
  const controller = read(
    "../components/salon/useSalonGenerationController.ts",
  );
  const adapter = read(
    "../components/salon/salonGenerationAdapter.ts",
  );

  assert.match(wizard, /useSalonGenerationController\(\{ customerId \}\)/);
  assert.doesNotMatch(
    wizard,
    /useAdminReadOnly|useUpload|useRouter|usePaidActionQuoteExpired|\bfetch\(/,
  );
  assert.doesNotMatch(controller, /\bfetch\(/);
  assert.match(controller, /quoteRequestIdRef\.current === requestId/);
  assert.match(controller, /while \(true\)/);
  assert.match(controller, /setCurrentStep\("progress"\)/);
  assert.match(controller, /pipelineStage === "completed" && completedCount > 0/);
  assert.match(controller, /data\.code === "QUOTE_CHANGED"/);
  assert.equal(occurrenceCount(adapter, /\bfetch\(/g), 7);
  assert.match(adapter, /`\/api\/salon\/customers\/\$\{encodeURIComponent\(customerId\)\}`/);
  assert.match(adapter, /fetch\("\/api\/paid-actions\/quote"/);
  assert.match(adapter, /fetch\("\/api\/generations\/drafts"/);
  assert.match(adapter, /workspace\/recommendations`/);
  assert.match(adapter, /workspace\/confirm`/);
  assert.match(
    adapter,
    /generationId,[\s\S]*selectedVariantId,[\s\S]*serviceType,[\s\S]*serviceDate,[\s\S]*nextRecommendedVisitAt,[\s\S]*memo,[\s\S]*createAftercare/,
  );
});
