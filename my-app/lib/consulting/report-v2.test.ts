import assert from "node:assert/strict";
import test from "node:test";
import { projectConsultationReportV2 } from "@hairfit/shared/consulting/report-v2";
import { assertMatchingConsultationReportReceiptsV1, projectConsultationReportReceiptV1 } from "@hairfit/shared/consulting/report-observability";
import { createConsultationSnapshot } from "./defaults.ts";

function completeSnapshot() {
  const base = createConsultationSnapshot({ sessionId: "44444444-4444-4444-8444-444444444444", userId: "report-v2-user", now: "2026-08-16T12:00:00.000Z" });
  const previews = base.previews.map((item, index) => ({ ...item, status: "accepted" as const, imageUrl: `https://example.com/hair-${index}.png`, reason: `${item.axis} 선택 근거` }));
  return {
    ...base,
    evidence: { pipelineStatus: "reviewed" as const, reviewedAt: "2026-08-16T12:01:00.000Z", items: [{ id: "ev-1", layer: "contour" as const, evidence: "턱선과 광대 균형", meaning: "타원형에 가까운 혼합형", action: "측면 볼륨을 낮게 유지", confidence: "high" as const, manuallyCorrected: false }] },
    faceAnalysis: { faceShape: "타원형", balance: "균형", hairline: "완만함", density: "중간", confidence: "high" as const },
    strategy: { ...base.strategy, confirmedAt: "2026-08-16T12:02:00.000Z" },
    strategyRecommendations: [{ axis: "length" as const, recommendedValue: "medium", evidenceId: "ev-1", reason: "얼굴 세로 비율을 안정화", impact: "턱선 주변이 정돈됨", tradeoff: "너무 짧은 기장은 피함" }],
    previews,
    finalist: { finalistPreviewId: previews[0].id, backupPreviewId: previews[1].id, decidedAt: "2026-08-16T12:03:00.000Z" },
    selectedStyleHistory: [{ id: "selection-1", revision: 1, previewId: previews[0].id, label: "소프트 미디엄 레이어", reason: "얼굴 균형과 관리 조건에 적합", imageUrl: previews[0].imageUrl, generatedImagePath: null, feasibility: "높음", currentHairGap: "기장 유지", services: ["커트"], maintenance: "보통", limitations: ["과도한 층은 피함"], strategy: { ...base.strategy, confirmedAt: "2026-08-16T12:02:00.000Z" }, selectedAt: "2026-08-16T12:04:00.000Z", supersedesSnapshotId: null, serviceConfirmedAt: null }],
    personalColorDiagnosis: { ...base.personalColorDiagnosis, state: "ready" as const, qualityStatus: "reliable" as const, qualityConfidence: 0.88, primaryType: "autumn_muted", secondaryType: "autumn_warm", blend: { autumn_muted: 0.62, autumn_warm: 0.24, summer_muted: 0.14 }, axes: { temperature: 0.48, value: -0.12, chroma: -0.25, contrast: -0.18 }, palette: { best: ["#8C6D5B"], neutrals: ["#D8C7B5"], accents: ["#9C5F45"], caution: ["#2D61FF"], metals: ["#B08D57"] }, summary: "부드럽고 따뜻한 저채도 조화", hairColorHints: ["뮤트 브라운"], completedAt: "2026-08-16T12:05:00.000Z" },
    colorDecision: { ...base.colorDecision, id: "color-1", state: "confirmed" as const, colorName: "뮤트 베이지 브라운", swatchHex: "#8C6D5B", targetLevel: 7, bleachPolicy: "현장 진단 후 1회", maintenance: "컬러 전용 케어", fadeDirection: "웜 베이지", confirmedAt: "2026-08-16T12:06:00.000Z", finalImageUrl: "https://example.com/color.png" },
    salonBrief: { ...base.salonBrief, summary: "확정 헤어와 컬러를 살롱에 전달", cut: "미디엄 레이어", volumeTexture: "측면 낮게", styling: "자연 건조 후 끝선 정돈", caution: ["과도한 층 금지"], createdAt: "2026-08-16T12:07:00.000Z" },
    makeupDirection: { id: "makeup-1", status: "confirmed" as const, confirmedAt: "2026-08-16T12:08:00.000Z", sourceFingerprint: "a".repeat(64) },
    fashion: { ...base.fashion, direction: "뮤트 팔레트의 미니멀 데일리", lookId: "look-1", category: "DAILY" as const, label: "뮤트 데일리 룩", items: [{ slot: "top", name: "니트", color: "뮤트 베이지", fit: "regular", material: "wool" }], palette: ["#8C6D5B"], neckline: "round", silhouette: "regular", shoppingKeywords: ["뮤트 니트"], selectedAt: "2026-08-16T12:09:00.000Z" },
    result: { ...base.result, id: "result-1", version: 2, state: "core-ready" as const, headline: "부드러운 균형과 뮤트 조화", rationale: ["얼굴 균형", "관리 조건", "퍼스널 컬러"], limitations: ["현장 모발 진단 필요"], compiledAt: "2026-08-16T12:10:00.000Z" },
    actualService: { services: ["사용자 리포트에 노출되면 안 되는 실제 시술"], serviceDate: "2026-08-17", designerNotes: "비공개", confirmedAt: "2026-08-17T03:00:00.000Z" },
    careProgram: { ...base.careProgram, actualServiceId: "actual-1", today: ["장기 프로그램 내부 데이터"], concerns: ["비공개 우려"], satisfaction: 4 },
  };
}

test("V2 report owns eleven sections across the fixed five result tabs", () => {
  const report = projectConsultationReportV2(completeSnapshot());
  assert.equal(report.schemaVersion, "consultation-report-view-model-v2");
  assert.equal(report.defaultTab, "final");
  assert.deepEqual(report.tabs.map((tab) => tab.key), ["hair", "color", "makeup", "fashion", "final"]);
  assert.deepEqual(Object.fromEntries(report.tabs.map((tab) => [tab.key, tab.sections.map((section) => section.key)])), {
    hair: ["face-hair-analysis", "hair-direction", "candidate-comparison", "final-hair"],
    color: ["personal-color", "final-color"],
    makeup: ["makeup-result"],
    fashion: ["fashion-result"],
    final: ["executive-summary", "salon-specification", "initial-care"],
  });
  assert.equal(report.tabs.flatMap((tab) => tab.sections).length, 11);
  assert.equal(new Set(report.tabs.flatMap((tab) => tab.sections.map((section) => section.key))).size, 11);
});

test("V2 report excludes journey internals and actual Aftercare program state", () => {
  const serialized = JSON.stringify(projectConsultationReportV2(completeSnapshot()));
  for (const forbidden of ["input-quality", "request\"", "not_started", "actualService", "careProgram", "actual-1", "장기 프로그램 내부 데이터", "비공개 우려", "aftercare-photo"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(serialized.includes("initial-care"), true);
});

test("V2 report omits optional not-started sections and keeps the Final tab", () => {
  const snapshot = createConsultationSnapshot({ sessionId: "55555555-5555-4555-8555-555555555555", userId: "report-v2-user", now: "2026-08-16T12:00:00.000Z" });
  const report = projectConsultationReportV2(snapshot);
  assert.equal(report.tabs.some((tab) => tab.key === "makeup"), false);
  assert.equal(report.tabs.some((tab) => tab.key === "fashion"), false);
  assert.equal(report.tabs.some((tab) => tab.key === "final"), true);
  assert.equal(report.tabs.flatMap((tab) => tab.sections).some((section) => "status" in section && (section as { status?: string }).status === "not_started"), false);
});

test("V2 report uses the confirmed makeup simulation and hair profile provenance", () => {
  const report = projectConsultationReportV2(completeSnapshot(), {
    makeupMoodImageUrl: "https://example.com/makeup-simulation.png",
    hairProfile: {
      schemaVersion: "hair-profile-v2", id: "hair-profile-1", consultationId: "44444444-4444-4444-8444-444444444444", revision: 2,
      state: "ready", sourceFingerprint: "c".repeat(64),
      observed: [{ id: "observation-1", traitId: "texture_pattern", source: "observed", value: "약한 웨이브", confidence: 0.86, evidenceRegions: [], evidenceIds: [], limitations: [], model: null }],
      reported: {}, inferred: {}, unknownFieldIds: ["strand_thickness_class"], conflicts: [], unresolvedFieldIds: [],
      questionBudget: { preResultUsed: 1, postResultUsed: 0, maximum: 4 }, confirmedRevision: null, supersedesProfileId: null,
      createdAt: "2026-08-16T12:00:00.000Z", updatedAt: "2026-08-16T12:01:00.000Z",
    },
  });
  const makeup = report.tabs.find((tab) => tab.key === "makeup")?.sections[0];
  const hair = report.tabs.find((tab) => tab.key === "hair")?.sections.find((section) => section.key === "face-hair-analysis");
  assert.equal(makeup?.key, "makeup-result");
  if (makeup?.key === "makeup-result") assert.equal(makeup.payload.moodImage?.src, "https://example.com/makeup-simulation.png");
  if (hair?.key === "face-hair-analysis") assert.equal(hair.payload.observations.some((item) => item.value.includes("약한 웨이브")), true);
});

test("P53 report and PDF projection retain every generated Hair and Fashion result", () => {
  const snapshot = completeSnapshot();
  const fashionCandidates = Array.from({ length: 9 }, (_, index) => ({
    stylingSessionId: `fashion-${index + 1}`,
    selectionSnapshotId: "selection-1",
    slotId: `slot-${index + 1}`,
    category: index < 3 ? "DAILY" as const : index < 6 ? "WORK" as const : "STATEMENT" as const,
    genre: "fixture",
    direction: snapshot.fashion.directionSnapshot,
    status: "completed",
    headline: `패션 생성 ${index + 1}`,
    summary: "확정 헤어 기반 생성",
    palette: ["#8C6D5B"],
    silhouette: "regular",
    neckline: "round",
    items: snapshot.fashion.items,
    shoppingKeywords: ["fixture"],
    imageUrl: `https://example.com/fashion-${index + 1}.png`,
    errorMessage: null,
    createdAt: "2026-08-16T12:09:00.000Z",
    updatedAt: "2026-08-16T12:09:30.000Z",
  }));
  const report = projectConsultationReportV2(snapshot, {
    fashionCandidates,
    fashionBatch: {
      schemaVersion: "fashion-preview-batch-v2", id: "fashion-batch-1", baseBatchId: "fashion-batch-1", state: "selected",
      requestedCount: 9, completedCount: 9, failedCount: 0, terminalCount: 9, stalledCount: 0, retryingCount: 0,
      quoteId: null, generationInputFingerprint: "fashion-fingerprint", colorSelectionSnapshotId: "color-1", personalColorProfileId: null,
      expansionLevel: 2, recommendedPreviewId: "fashion-1", selectedPreviewId: "fashion-1", usageReceiptIds: [], revision: 3,
      slotRoles: Object.fromEntries(fashionCandidates.map((item, index) => [item.slotId, index === 0 ? "hero" : index % 3 === 1 ? "practical" : "variation"])),
      slotState: Object.fromEntries(fashionCandidates.map((item) => [item.slotId, "completed"])), slotProgress: {},
      lastHeartbeatAt: "2026-08-16T12:09:30.000Z", errorCode: null, errorMessage: null, updatedAt: "2026-08-16T12:09:30.000Z",
    },
    fashionPreviewSet: {
      schemaVersion: "fashion-preview-set-v2", consultationId: snapshot.sessionId, selectionSnapshotId: "selection-1",
      personalColorEvidenceId: null, colorSelectionSnapshotId: "color-1", selectedHairSnapshotId: "selection-1",
      stylingSessionIds: fashionCandidates.map((item) => item.stylingSessionId), selectedStylingSessionId: "fashion-1",
      directionSnapshot: snapshot.fashion.directionSnapshot, inputSnapshot: { schemaVersion: "consultation-generation-input-v1", inputFingerprint: "fashion-fingerprint", styleTarget: "neutral", capturedAt: "2026-08-16T12:09:00.000Z", provenance: [] },
      selectedLook: { slotId: "slot-1", category: "DAILY", genre: "fixture", label: "패션 생성 1", items: snapshot.fashion.items, palette: ["#8C6D5B"], neckline: "round", silhouette: "regular", shoppingKeywords: ["fixture"] },
      version: 1, createdAt: "2026-08-16T12:09:30.000Z",
    },
  });
  const hair = report.tabs.find((tab) => tab.key === "hair")?.sections.find((section) => section.key === "candidate-comparison");
  const fashion = report.tabs.find((tab) => tab.key === "fashion")?.sections.find((section) => section.key === "fashion-result");
  assert.equal(hair?.key, "candidate-comparison");
  assert.equal(fashion?.key, "fashion-result");
  if (hair?.key === "candidate-comparison") assert.equal(hair.payload.candidates.length, 9);
  if (fashion?.key === "fashion-result") assert.equal(fashion.payload.looks.length, 9);
  assert.equal(report.provenance.fashion?.generatedPreviewIds.length, 9);
  const receipts = (["web", "native", "pdf"] as const).map((surface) => projectConsultationReportReceiptV1(report, surface));
  assertMatchingConsultationReportReceiptsV1(receipts);
  assert.equal(receipts.every((receipt) => receipt.mismatch === false), true);
});
