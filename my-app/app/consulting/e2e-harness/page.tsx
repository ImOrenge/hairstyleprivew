import { notFound } from "next/navigation";
import { ConsultationStagePage } from "../../../components/consulting/ConsultationStagePage";
import { CONSULTATION_STAGE_SLUGS, isConsultationStage, isConsultationTaskKind } from "../../../lib/consulting/contracts";
import { createConsultationSnapshot } from "../../../lib/consulting/defaults";
import { deriveConsultationJourney } from "../../../lib/consulting/contracts";
import { compileHairColorPreviewCandidates } from "../../../lib/consulting/color-preview-candidates";
import { MakeupDirectionFixture } from "../../../components/consulting/makeup/MakeupDirectionFixture";
import { MakeupInterviewFixture } from "../../../components/consulting/makeup/MakeupInterviewFixture";
import { MakeupSimulationFixture } from "../../../components/consulting/makeup/MakeupSimulationFixture";
import { ConsultationScene } from "../../../components/consulting/scene/ConsultationScene";
import { projectConsultationReportV2, type ConsultationReportSourceV2 } from "../../../lib/consulting/contracts";
import { attachConsultationResultNarrative } from "../../../lib/consulting/result-narrative-service";

export const metadata = { title: "Consulting Scene E2E Harness", robots: { index: false, follow: false } };
interface Props { searchParams: Promise<{ stage?: string; transition?: string; liveness?: string; transitionState?: string; polling?: string; interview?: string; zeroInput?: string; hairRecommendation?: string; fashionAdaptive?: string; colorLevel?: string; color?: string; diagnostics?: string; simulation?: string }> }
export default async function ConsultingSceneHarnessPage({ searchParams }: Props) {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") notFound();
  const query = await searchParams;
  const requested = query.stage || "discovery";
  if (!isConsultationStage(requested)) notFound();
  const snapshot = createConsultationSnapshot({ sessionId: "00000000-0000-4000-8000-000000000011", userId: "e2e-consulting", now: "2026-08-08T00:00:00.000Z" });
  snapshot.currentStage = "fashion";
  snapshot.completedStages = [...CONSULTATION_STAGE_SLUGS];
  snapshot.discovery = {
    ...snapshot.discovery,
    purpose: "출근용 이미지 정리",
    goals: ["얼굴 균형 보완"],
    currentHair: "어깨 길이의 자연 모발",
    desiredServices: ["커트"],
    allowedServices: ["커트"],
    maintenanceLevel: "medium",
    avoid: ["과한 볼륨"],
    notes: "",
  };
  snapshot.photo.generationId = "e2e-generation";
  snapshot.photo.draftId = "00000000-0000-4000-8000-000000000012";
  snapshot.photo.uploadedAt = "2026-08-08T00:00:00.000Z";
  snapshot.photo.expiresAt = "2026-08-09T00:00:00.000Z";
  snapshot.photo.capturedAt = "2026-08-08T00:00:00.000Z";
  snapshot.photo.quality = snapshot.photo.quality.map((item) => ({ ...item, status: "pass", message: "확인 완료" }));
  snapshot.evidence = {
    pipelineStatus: "reviewed",
    reviewedAt: "2026-08-08T00:01:00.000Z",
    items: [
      ["contour", "contour", "얼굴 윤곽", "균형 관찰", "길이 방향"],
      ["hairline", "hairline", "헤어라인", "이마 노출", "가르마 방향"],
      ["measurement", "measurement", "얼굴 비율", "길이·폭 균형", "볼륨 방향"],
      ["skin", "skin", "피부 샘플", "컬러 보조 근거", "컬러 교차 확인"],
      ["excluded", "excluded", "눈·입술 제외", "색상 왜곡 방지", "제외 영역 유지"],
      ["direction", "direction", "추천 초안", "선택 영향", "방향 조정"],
    ].map(([id, layer, evidence, meaning, action]) => ({
      id,
      layer: layer as "contour" | "hairline" | "measurement" | "skin" | "excluded" | "direction",
      evidence,
      meaning,
      action,
      confidence: "high" as const,
      manuallyCorrected: false,
    })),
  };
  snapshot.strategyRecommendations = (["length", "fringe", "parting", "layerStart", "crownVolume", "sideVolume", "texture", "color"] as const).map((axis) => ({
    axis,
    recommendedValue: String(snapshot.strategy[axis]),
    evidenceId: axis === "color" ? "skin" : axis === "fringe" || axis === "parting" ? "hairline" : "contour",
    reason: "E2E 분석 근거",
    impact: "선택에 따른 예상 영향",
    tradeoff: "관리 조건과 함께 확인",
  }));
  if (requested === "analysis") {
    const observedAt = "2026-08-08T00:02:00.000Z";
    snapshot.hairProfile = {
      schemaVersion: "hair-profile-v2", id: "00000000-0000-4000-8000-000000000081", consultationId: snapshot.sessionId, revision: 1,
      state: "clarification_available", sourceFingerprint: "d".repeat(64),
      observed: [
        { id: "hair-observation-texture", traitId: "texture_pattern", source: "observed", value: "약한 웨이브", confidence: 0.84, evidenceRegions: [{ x: 0.2, y: 0.08, width: 0.6, height: 0.38 }], evidenceIds: [], limitations: ["제품 사용 여부는 사진으로 확인할 수 없음"], model: { provider: "fixture", name: "fixture", version: "1" } },
        { id: "hair-observation-density", traitId: "apparent_density", source: "observed", value: "중간 이상으로 보임", confidence: 0.78, evidenceRegions: [{ x: 0.15, y: 0.05, width: 0.7, height: 0.45 }], evidenceIds: [], limitations: ["실제 모수와 두피 상태는 확인 불가"], model: { provider: "fixture", name: "fixture", version: "1" } },
      ],
      reported: {}, inferred: {}, unknownFieldIds: ["strand_thickness_class", "visible_end_condition"], conflicts: [], unresolvedFieldIds: ["strand_thickness_class"],
      questionBudget: { preResultUsed: 0, postResultUsed: 0, maximum: 4 }, confirmedRevision: null, supersedesProfileId: null, createdAt: observedAt, updatedAt: observedAt,
    };
    snapshot.diagnosticQuestions = [{
      id: "00000000-0000-4000-8000-000000000082", templateId: "chemical-history", consultationId: snapshot.sessionId,
      analysisRunId: "00000000-0000-4000-8000-000000000083", profileRevision: 1, queue: "diagnosis-critical", state: "visible",
      reasonCode: "missing_or_low_confidence:chemical_history", evidenceIds: [], prompt: "최근 12개월 안에 받은 화학 시술이 있나요?",
      options: ["없음", "염색", "탈색", "펌", "잘 모르겠어요"].map((label) => ({ value: label, label })), answer: null, createdAt: observedAt, resolvedAt: null,
    }];
  }
  snapshot.previews = snapshot.previews.map((preview, index) => requested === "result"
    ? { ...preview, status: "accepted", imageUrl: "/images/consulting/models/hairfit-semi-real-model-v1.png" }
    : index < 2 ? { ...preview, status: "accepted" } : preview);
  if (requested === "fashion" && ["1", "3", "6", "9"].includes(query.fashionAdaptive ?? "")) {
    const requestedCount = query.fashionAdaptive === "6" ? 6 : query.fashionAdaptive === "9" ? 9 : 3;
    const allFashionSlots = ["daily-casual", "daily-minimal", "daily-athleisure", "work-office", "work-classic", "work-smart", "statement-street", "statement-formal", "statement-date"];
    const fashionSlots = allFashionSlots.slice(0, requestedCount);
    const allRoles = ["hero", "practical", "variation", "extension-hero", "extension-practical", "extension-variation", "extension-hero", "extension-practical", "extension-variation"] as const;
    snapshot.fashionBatch = {
      schemaVersion: "fashion-preview-batch-v2",
      id: "00000000-0000-4000-8000-000000000091",
      baseBatchId: "00000000-0000-4000-8000-000000000091",
      state: "ready",
      requestedCount,
      completedCount: requestedCount,
      failedCount: 0,
      terminalCount: requestedCount,
      stalledCount: 0,
      retryingCount: 0,
      quoteId: "e2e-fashion-quote",
      generationInputFingerprint: "e2e-fashion-input-fingerprint",
      colorSelectionSnapshotId: null,
      personalColorProfileId: null,
      expansionLevel: requestedCount === 3 ? 0 : requestedCount === 6 ? 1 : 2,
      recommendedPreviewId: null,
      selectedPreviewId: null,
      usageReceiptIds: [],
      revision: 1,
      slotRoles: Object.fromEntries(fashionSlots.map((slot, index) => [slot, allRoles[index]])),
      slotState: Object.fromEntries(fashionSlots.map((slot) => [slot, "completed"])),
      slotProgress: Object.fromEntries(fashionSlots.map((slot) => [slot, { status: "completed" as const, attemptCount: 1, heartbeatAt: "2026-08-08T00:08:00.000Z", errorCode: null, errorMessage: null }])),
      lastHeartbeatAt: "2026-08-08T00:08:00.000Z",
      errorCode: null,
      errorMessage: null,
      updatedAt: "2026-08-08T00:08:00.000Z",
    };
  }
  if (["color-studio", "makeup", "result"].includes(requested)) {
    const selectedAt = "2026-08-08T00:05:00.000Z";
    snapshot.selectedStyleHistory = [{
      id: "00000000-0000-4000-8000-000000000020", revision: 1, previewId: snapshot.previews[0].id,
      label: "소프트 레이어", reason: "얼굴 균형을 유지하는 확정 스타일", imageUrl: "/images/consulting/models/hairfit-semi-real-model-v1.png", generatedImagePath: null,
      feasibility: "salon-review", currentHairGap: "레이어 연결", services: ["cut"], maintenance: "6~8주", limitations: [], strategy: snapshot.strategy,
      selectedAt, supersedesSnapshotId: null, serviceConfirmedAt: null,
    }];
    snapshot.colorDecision = {
      ...snapshot.colorDecision, state: "editing", selectionSnapshotId: snapshot.selectedStyleHistory[0].id,
      colorName: query.color === "beige" ? "베이지 브라운" : snapshot.colorDecision.colorName,
      swatchHex: query.color === "beige" ? "#9A765B" : snapshot.colorDecision.swatchHex,
      targetLevel: query.colorLevel ? Math.max(1, Math.min(10, Number(query.colorLevel) || 5)) : snapshot.colorDecision.targetLevel,
      hairMask: null,
      candidates: [
        { id: "candidate-1", colorName: "초콜릿 브라운", swatchHex: "#4D3426", technique: "full", targetLevel: 5, intensity: 70, temperature: 0, saturation: 0, rootDepth: 20, createdAt: selectedAt },
        { id: "candidate-2", colorName: "코퍼 브라운", swatchHex: "#8B4A32", technique: "balayage", targetLevel: 7, intensity: 60, temperature: 18, saturation: 12, rootDepth: 30, createdAt: selectedAt },
      ],
    };
  }
  if (["personal-color", "color-studio", "makeup", "result"].includes(requested)) {
    snapshot.photo.primaryUrl = "/images/consulting/models/hairfit-semi-real-model-v1.png";
    snapshot.personalColorDiagnosis = {
      state: "ready",
      evidenceId: "00000000-0000-4000-8000-000000000030",
      qualityStatus: "reliable",
      qualityConfidence: 0.89,
      warnings: [],
      primaryType: "autumn_deep",
      secondaryType: "autumn_warm",
      blend: { autumn_deep: 0.54, autumn_warm: 0.27, autumn_muted: 0.11, winter_deep: 0.08 },
      axes: { temperature: 0.72, value: 0.34, chroma: 0.58, contrast: 0.67 },
      palette: {
        best: ["#4D3426", "#B98248", "#6E7045"],
        neutrals: ["#4D3426", "#D8B58A"],
        accents: ["#B98248", "#D94A32"],
        caution: ["#B8A9D9", "#2E5AAC", "#F8F8F5"],
        metals: ["antique-gold", "bronze"],
      },
      detailVersion: "color-detail-v2",
      summary: "깊이감 있는 웜톤과 중고대비에 가까워, 노란 기보다 브라운과 올리브가 섞인 차분한 색에서 얼굴 윤곽이 안정적으로 보입니다.",
      bestColors: [
        { nameKo: "초콜릿 브라운", nameEn: "Chocolate Brown", hex: "#4D3426", reason: "warm deep neutral", recommendationReason: "모발과 눈동자의 깊이를 유지하면서 피부의 따뜻한 기운을 자연스럽게 연결합니다.", nonRecommendationReason: "얼굴 전체를 같은 저명도로 채우면 무거워질 수 있어 밝은 이너를 함께 쓰는 편이 좋습니다.", meaning: "신뢰감 있고 정돈된 인상을 만드는 깊은 뉴트럴입니다.", stylingTip: "재킷·니트·헤어 컬러의 기준색으로 두고 카멜이나 아이보리로 명도 차를 만드세요.", colorCombinations: [{ title: "출근용 딥 웜", hexes: ["#4D3426", "#D8B58A", "#F6E8D7"], reason: "깊은 브라운을 중심으로 얼굴 가까이에 밝은 웜 뉴트럴을 배치합니다." }, { title: "톤온톤 살롱", hexes: ["#4D3426", "#B98248", "#6E7045"], reason: "브라운의 깊이를 유지하면서 카멜과 올리브로 자연스러운 변화를 줍니다." }] },
        { nameKo: "카멜", nameEn: "Camel", hex: "#B98248", reason: "warm medium neutral", recommendationReason: "피부의 온기를 살리면서 딥 타입의 무게를 과도하게 낮추지 않습니다.", nonRecommendationReason: "노란 조명 아래에서는 얼굴이 노랗게 보일 수 있어 아이보리나 브라운으로 경계를 잡아야 합니다.", meaning: "편안함과 성숙함을 동시에 주는 대표적인 웜 뉴트럴입니다.", stylingTip: "얼굴 가까이 단독으로 쓰기보다 초콜릿 브라운 아우터나 헤어와 조합하세요.", colorCombinations: [{ title: "카멜 포인트", hexes: ["#B98248", "#4D3426", "#F6E8D7"], reason: "카멜의 온기를 브라운과 아이보리가 안정적으로 받쳐 줍니다." }, { title: "어텀 캐주얼", hexes: ["#B98248", "#6E7045", "#D8B58A"], reason: "중명도 웜 계열 안에서 채도 차로 입체감을 만듭니다." }] },
        { nameKo: "올리브", nameEn: "Olive", hex: "#6E7045", reason: "warm muted green", recommendationReason: "붉은 기를 과장하지 않으면서 피부와 모발 사이의 대비를 부드럽게 정리합니다.", nonRecommendationReason: "회색 기가 지나치게 강한 올리브는 안색을 탁하게 만들 수 있습니다.", meaning: "차분하고 지적인 분위기를 더하는 뮤트 포인트 컬러입니다.", stylingTip: "상의나 액세서리 포인트로 쓰고 초콜릿 브라운과 함께 깊이를 유지하세요.", colorCombinations: [{ title: "올리브 클래식", hexes: ["#6E7045", "#4D3426", "#D8B58A"], reason: "웜 딥 베이스에 뮤트 그린을 얹어 차분한 대비를 만듭니다." }, { title: "소프트 액센트", hexes: ["#6E7045", "#B98248", "#F6E8D7"], reason: "카멜과 아이보리로 올리브의 탁함을 줄입니다." }] },
      ],
      avoidColors: [
        { nameKo: "소프트 라벤더", nameEn: "Soft Lavender", hex: "#B8A9D9", reason: "cool light pastel", recommendationReason: "작은 액세서리로는 차가운 포인트를 만들 수 있습니다.", nonRecommendationReason: "얼굴 가까이 넓게 쓰면 웜 딥의 깊이가 사라지고 피부가 회색빛으로 보일 수 있습니다.", meaning: "가볍고 섬세한 쿨 파스텔입니다.", stylingTip: "사용한다면 하의나 작은 소품으로 제한하고 얼굴 근처에는 브라운을 배치하세요.", colorCombinations: [{ title: "제한적 라벤더", hexes: ["#B8A9D9", "#4D3426", "#D8B58A"], reason: "브라운과 베이지가 라벤더의 차가움을 완충합니다." }, { title: "소품 포인트", hexes: ["#B8A9D9", "#6E7045", "#F6E8D7"], reason: "낮은 면적으로만 사용해 안색 영향을 줄입니다." }] },
        { nameKo: "코발트 블루", nameEn: "Cobalt Blue", hex: "#2E5AAC", reason: "cool clear blue", recommendationReason: "강한 대비가 필요한 작은 포인트에는 사용할 수 있습니다.", nonRecommendationReason: "차갑고 선명한 면적이 커지면 피부의 따뜻한 기와 충돌합니다.", meaning: "선명하고 역동적인 쿨 포인트 컬러입니다.", stylingTip: "가방이나 슈즈 한 곳에만 쓰고 상의는 초콜릿 브라운으로 정리하세요.", colorCombinations: [{ title: "쿨 포인트 제한", hexes: ["#2E5AAC", "#4D3426", "#F6E8D7"], reason: "딥 브라운이 코발트의 강도를 안정시킵니다." }, { title: "액세서리 전용", hexes: ["#2E5AAC", "#B98248", "#D8B58A"], reason: "웜 뉴트럴 중심에 작은 대비만 남깁니다." }] },
        { nameKo: "퓨어 화이트", nameEn: "Pure White", hex: "#F8F8F5", reason: "cool clear neutral", recommendationReason: "선명한 명도 대비가 필요한 디테일에는 사용할 수 있습니다.", nonRecommendationReason: "얼굴 바로 아래 넓게 쓰면 대비가 과해지고 안색이 창백해 보일 수 있습니다.", meaning: "깨끗하고 강한 대비를 만드는 밝은 뉴트럴입니다.", stylingTip: "퓨어 화이트 대신 아이보리를 우선하고, 필요하면 칼라나 패턴의 작은 면적으로 쓰세요.", colorCombinations: [{ title: "화이트 완충", hexes: ["#F8F8F5", "#4D3426", "#B98248"], reason: "브라운과 카멜이 높은 명도 대비를 완충합니다." }, { title: "패턴 한정", hexes: ["#F8F8F5", "#6E7045", "#D8B58A"], reason: "화이트 면적을 줄이고 뮤트 웜 컬러를 중심에 둡니다." }] },
      ],
      stylingPalette: ["#4D3426", "#B98248", "#6E7045", "#D8B58A", "#F6E8D7"],
      hairColorHints: ["딥 초콜릿 브라운", "카카오 브라운", "웜 올리브 브라운"],
      model: "gpt-5.4-mini",
      hairColorDirections: [{ id: "deep-chocolate", name: "딥 초콜릿 브라운", reason: "깊이와 대비를 유지하면서 피부 톤의 온기를 연결합니다.", targetLevel: 5, bleachPolicy: "현재 베이스 진단", maintenance: "6~8주" }],
      startedAt: "2026-08-08T00:01:00.000Z",
      completedAt: "2026-08-08T00:02:00.000Z",
      errorCode: null,
      errorMessage: null,
    };
  }
  if (requested === "color-studio") {
    snapshot.hairColorPreviewRuns = compileHairColorPreviewCandidates(snapshot).map((candidate, index) => {
      const runtimeState = query.transitionState === "running" && index > 0 ? (index === 1 ? "generating" : "queued") : query.transitionState === "retry-required" && index === 2 ? "retry-required" : "completed";
      return {
      id: `00000000-0000-4000-8000-00000000004${index}`,
      candidateKey: candidate.key,
      purpose: "exploration",
      quality: "low",
      state: runtimeState,
      colorName: candidate.salonName,
      swatchHex: candidate.swatchHex,
      technique: candidate.technique,
      targetLevel: candidate.targetLevel,
      rationale: candidate.rationale,
      bleachPolicy: candidate.bleachPolicy,
      maintenance: candidate.maintenance,
      cautions: candidate.cautions,
      outputUrl: runtimeState === "completed" ? "/images/consulting/models/hairfit-semi-real-model-v1.png" : null,
      outputPath: runtimeState === "completed" ? `e2e/color-${candidate.key}.png` : null,
      inputFingerprint: `e2e-color-${candidate.key}`,
      attemptCount: 1,
      heartbeatAt: null,
      errorCode: runtimeState === "retry-required" ? "E2E_COLOR_RETRY" : null,
      errorMessage: runtimeState === "retry-required" ? "컬러 후보 생성이 중단되어 다시 확인이 필요합니다." : null,
      startedAt: "2026-08-08T00:05:00.000Z",
      completedAt: runtimeState === "completed" ? "2026-08-08T00:05:30.000Z" : null,
      updatedAt: `2026-08-08T00:05:3${index}.000Z`,
    }; });
  }
  if (requested === "makeup") {
    snapshot.strategy = { ...snapshot.strategy, confirmedAt: "2026-08-08T00:03:00.000Z" };
    snapshot.shortlist = { previewIds: snapshot.previews.slice(0, 2).map((preview) => preview.id), updatedAt: "2026-08-08T00:04:00.000Z" };
    snapshot.finalist = { finalistPreviewId: snapshot.previews[0].id, backupPreviewId: snapshot.previews[1].id, decidedAt: "2026-08-08T00:04:30.000Z" };
    snapshot.salonBrief = { ...snapshot.salonBrief, version: 2, summary: "확정 스타일을 전달하는 상담 브리프", createdAt: "2026-08-08T00:07:00.000Z" };
    snapshot.makeupDirection = { id: "00000000-0000-4000-8000-000000000033", status: "confirmed", confirmedAt: "2026-08-08T00:07:15.000Z", sourceFingerprint: "e2e-makeup-direction" };
  }
  if (requested === "result") {
    snapshot.makeupDirection = {
      id: "00000000-0000-4000-8000-000000000033",
      status: "confirmed",
      confirmedAt: "2026-08-08T00:07:15.000Z",
      sourceFingerprint: "e2e-makeup-direction",
    };
    snapshot.colorDecision = {
      ...snapshot.colorDecision,
      id: "00000000-0000-4000-8000-000000000031",
      revision: 1,
      state: "confirmed",
      colorName: "딥 초콜릿 브라운",
      finalImageUrl: "/images/consulting/models/hairfit-semi-real-model-v1.png",
      finalImagePath: "e2e/color-final.png",
      confirmedAt: "2026-08-08T00:06:00.000Z",
    };
    snapshot.salonBrief = {
      ...snapshot.salonBrief,
      version: 2,
      summary: "소프트 레이어와 딥 초콜릿 브라운을 연결한 상담 브리프",
      createdAt: "2026-08-08T00:07:00.000Z",
    };
    snapshot.fashion = {
      ...snapshot.fashion,
      direction: "출근과 일상에서 헤어의 부드러운 균형을 이어가는 딥 웜 룩",
      shortlistIds: ["fashion-daily", "fashion-work"],
      lookId: "fashion-work",
      category: "WORK",
      label: "딥 웜 미니멀 워크 룩",
      items: [
        { slot: "outer", name: "블랙 테일러드 재킷", color: "블랙", fit: "relaxed", material: "wool blend" },
        { slot: "top", name: "소프트 블루 셔츠", color: "소프트 블루", fit: "regular", material: "cotton" },
        { slot: "bottom", name: "토프 와이드 슬랙스", color: "토프", fit: "relaxed", material: "wool blend" },
      ],
      palette: ["#4D3426", "#B98248", "#F6E8D7"],
      neckline: "open collar",
      silhouette: "relaxed tailored",
      selectedAt: "2026-08-08T00:07:30.000Z",
      sourceColorSelectionId: snapshot.colorDecision.id,
      staleReason: null,
    };
    const resultFashionSlots = ["work-office", "daily-casual", "statement-formal", "daily-minimal", "daily-athleisure", "work-classic", "work-smart", "statement-street", "statement-date"];
    snapshot.fashionBatch = {
      schemaVersion: "fashion-preview-batch-v2", id: "00000000-0000-4000-8000-000000000091", baseBatchId: "00000000-0000-4000-8000-000000000091", state: "selected",
      requestedCount: 9, completedCount: 9, failedCount: 0, terminalCount: 9, stalledCount: 0, retryingCount: 0,
      quoteId: "e2e-report-fashion", generationInputFingerprint: "e2e-report-fashion-fingerprint", colorSelectionSnapshotId: snapshot.colorDecision.id,
      personalColorProfileId: null, expansionLevel: 2, recommendedPreviewId: "fashion-work", selectedPreviewId: "fashion-work", usageReceiptIds: [], revision: 3,
      slotRoles: Object.fromEntries(resultFashionSlots.map((slot, index) => [slot, index === 0 ? "hero" : index % 3 === 1 ? "practical" : "variation"])),
      slotState: Object.fromEntries(resultFashionSlots.map((slot) => [slot, "completed"])), slotProgress: {}, lastHeartbeatAt: "2026-08-08T00:07:30.000Z",
      errorCode: null, errorMessage: null, updatedAt: "2026-08-08T00:07:30.000Z",
    };
    snapshot.result = {
      id: "00000000-0000-4000-8000-000000000032",
      version: 1,
      state: "core-ready",
      heroImageUrl: "/images/consulting/models/hairfit-semi-real-model-v1.png",
      heroImagePath: "e2e/color-final.png",
      headline: "부드러운 균형과 깊이 있는 컬러를 연결한 최종 제안",
      rationale: ["확정 헤어의 얼굴 균형 보완", "퍼스널 컬러와 연결된 저명도 웜 브라운", "딥 웜 미니멀 워크 룩과 헤어 인상 연결"],
      limitations: ["실제 염색 전 모발 이력과 손상도 재확인"],
      nextActions: ["Salon Brief 확인", "확정 패션 팔레트 활용", "실제 시술 후 Aftercare 기록"],
      selectionSnapshotId: snapshot.selectedStyleHistory[0].id,
      colorSelectionSnapshotId: snapshot.colorDecision.id,
      personalColorEvidenceId: "00000000-0000-4000-8000-000000000030",
      salonBriefVersion: 2,
      fashionLookId: snapshot.fashion.lookId,
      fashionSelectedAt: snapshot.fashion.selectedAt,
      fashionSourceColorSelectionId: snapshot.fashion.sourceColorSelectionId ?? null,
      compiledAt: "2026-08-08T00:08:00.000Z",
    };
  }
  if (query.liveness === "1" && query.transition === "analysis" && ["running", "failed"].includes(query.transitionState ?? "")) {
    snapshot.currentStage = "scan";
    snapshot.lifecycleState = "photo_validated";
    snapshot.evidence = { pipelineStatus: "idle", reviewedAt: null, items: [] };
    snapshot.strategyRecommendations = [];
    snapshot.analysisRun = {
      id: "00000000-0000-4000-8000-000000000014",
      state: query.transitionState === "failed" ? "failed" : "landmarks",
      pipeline: { preflight: "complete", landmarks: query.transitionState === "failed" ? "failed" : "running", analyzing: "pending" },
      errorCode: query.transitionState === "failed" ? "ANALYSIS_FAILED" : null,
      errorMessage: query.transitionState === "failed" ? "사진 분석 연결이 중단되었습니다." : null,
      attemptCount: 1,
      startedAt: "2026-08-09T00:00:00.000Z",
      completedAt: null,
      updatedAt: "2026-08-09T00:00:01.000Z",
    };
  }
  if (query.liveness === "1" && query.transition === "preview-generation" && query.transitionState === "partial") {
    snapshot.currentStage = "previews";
    snapshot.lifecycleState = "preview_board_queued";
    snapshot.strategy = { ...snapshot.strategy, confirmedAt: "2026-08-09T00:00:00.000Z" };
    snapshot.previews = snapshot.previews.map((preview, index) => index === 0 ? {
      ...preview,
      status: "accepted",
      imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='300'%3E%3Crect width='240' height='300' fill='%23d8d2ca'/%3E%3C/svg%3E",
    } : { ...preview, status: "generating" });
  }
  snapshot.journey = deriveConsultationJourney(snapshot, snapshot.lifecycleState);
  const reportHairRoles = [
    "face-balance-proportion", "face-balance-hairline-parting", "face-balance-jawline-volume",
    "image-change-soft", "image-change-polished", "image-change-distinctive",
    "manageability-cut-first", "manageability-controlled-perm", "manageability-high-change",
  ] as const;
  const reportSource: ConsultationReportSourceV2 = requested === "result" ? {
    hairRecommendation: {
      schemaVersion: "hair-recommendation-decision-v1", consultationId: snapshot.sessionId, state: "confirmed",
      inputFingerprint: "e2e-hair-fingerprint", previewBatch: { schemaVersion: "hair-nine-preview-batch-ref-v1", batchId: "e2e-hair-batch", inputFingerprint: "e2e-hair-fingerprint", requestedCount: 9, acceptedCount: 9, failedCount: 0, terminalCount: 9, state: "terminal" },
      catalogVersion: "e2e-catalog", policyVersion: "hair-ranker-v1",
      rankedPreviews: snapshot.previews.map((preview, index) => ({ previewId: preview.id, catalogItemId: preview.sourceVariantId, slot: index + 1, gridRole: reportHairRoles[index], rank: index + 1, eligible: true, hardFailureCodes: [], score: 100 - index, scoreComponents: { userConstraintFit: 1, hairTraitFit: 1, faceEvidenceFit: 1, maintenanceFit: 1, imageQuality: 1, identityPreservation: 1, instructionAdherence: 1, diversityPenalty: 0 }, reasonCodes: ["e2e-fit"] })),
      primaryPreviewId: snapshot.previews[0].id, confidence: 0.91, clarification: null, clarificationCount: 0, sourceIds: ["e2e-analysis"], revision: 1, confirmedRevision: 1, supersedesRevision: null,
      createdAt: "2026-08-08T00:04:00.000Z", updatedAt: "2026-08-08T00:05:00.000Z",
    },
    fashionCandidates: [
      {
        stylingSessionId: "fashion-work", selectionSnapshotId: snapshot.selectedStyleHistory[0].id, slotId: "work-office", category: "WORK", genre: "office", direction: snapshot.fashion.directionSnapshot,
        status: "completed", headline: "딥 웜 미니멀 워크 룩", summary: "확정 헤어와 딥 웜 컬러를 이어가는 출근 룩", palette: ["#4D3426", "#B98248", "#F6E8D7"], silhouette: "relaxed tailored", neckline: "open collar",
        items: snapshot.fashion.items, shoppingKeywords: ["블랙 테일러드 재킷", "토프 와이드 슬랙스"], imageUrl: "/hero/fashion-demo/medium-work.webp", errorMessage: null, createdAt: "2026-08-08T00:07:00.000Z", updatedAt: "2026-08-08T00:07:30.000Z",
      },
      {
        stylingSessionId: "fashion-daily", selectionSnapshotId: snapshot.selectedStyleHistory[0].id, slotId: "daily-casual", category: "DAILY", genre: "casual", direction: snapshot.fashion.directionSnapshot,
        status: "completed", headline: "클린 데일리 캐주얼", summary: "짧은 아우터와 데님으로 가볍게 정리한 대안", palette: ["#454545", "#F6E8D7", "#6F8192"], silhouette: "regular relaxed", neckline: "crew neck",
        items: [{ slot: "outer", name: "차콜 쇼트 재킷", color: "차콜", fit: "regular", material: "wool blend" }, { slot: "bottom", name: "워시드 와이드 데님", color: "블루", fit: "relaxed", material: "denim" }], shoppingKeywords: ["차콜 쇼트 재킷", "와이드 데님"], imageUrl: "/hero/fashion-demo/short-clean.webp", errorMessage: null, createdAt: "2026-08-08T00:06:50.000Z", updatedAt: "2026-08-08T00:07:20.000Z",
      },
      {
        stylingSessionId: "fashion-statement", selectionSnapshotId: snapshot.selectedStyleHistory[0].id, slotId: "statement-formal", category: "STATEMENT", genre: "formal", direction: snapshot.fashion.directionSnapshot,
        status: "completed", headline: "롱 블랙 포멀", summary: "긴 수직선과 낮은 채도로 완성한 포멀 대안", palette: ["#171717", "#F1E8D8"], silhouette: "long tailored", neckline: "open crew",
        items: [{ slot: "outer", name: "블랙 롱 코트", color: "블랙", fit: "regular", material: "wool" }, { slot: "top", name: "웜 아이보리 티", color: "아이보리", fit: "regular", material: "cotton" }], shoppingKeywords: ["블랙 롱 코트", "웜 아이보리 티"], imageUrl: "/hero/fashion-demo/long-date.webp", errorMessage: null, createdAt: "2026-08-08T00:06:40.000Z", updatedAt: "2026-08-08T00:07:10.000Z",
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        stylingSessionId: `fashion-extra-${index + 1}`, selectionSnapshotId: snapshot.selectedStyleHistory[0].id,
        slotId: ["daily-minimal", "daily-athleisure", "work-classic", "work-smart", "statement-street", "statement-date"][index],
        category: index < 2 ? "DAILY" as const : index < 4 ? "WORK" as const : "STATEMENT" as const,
        genre: "curated", direction: snapshot.fashion.directionSnapshot, status: "completed", headline: `확장 패션 룩 ${index + 4}`,
        summary: "확정 헤어와 컬러를 기준으로 만든 확장 생성 결과", palette: ["#4D3426", "#B98248", "#F6E8D7"], silhouette: "regular tailored", neckline: "balanced",
        items: snapshot.fashion.items, shoppingKeywords: ["딥 웜 스타일"], imageUrl: ["/hero/fashion-demo/medium-work.webp", "/hero/fashion-demo/short-clean.webp", "/hero/fashion-demo/long-date.webp"][index % 3],
        errorMessage: null, createdAt: "2026-08-08T00:06:30.000Z", updatedAt: "2026-08-08T00:07:30.000Z",
      })),
    ],
    fashionBatch: snapshot.fashionBatch,
    fashionPersonalizationSnapshotId: "e2e-fashion-personalization",
    fashionOfferSnapshots: [{
      schemaVersion: "fashion-product-offer-v1", snapshotId: "e2e-offer-snapshot-1", capturedForConsultationId: snapshot.sessionId, recommendationRevision: 1, immutable: true,
      offerId: "e2e-offer-1", sourceId: "e2e-source", sellerId: "e2e-seller", sellerProductId: "e2e-product", canonicalProductId: "e2e-canonical",
      brandName: "E2E Atelier", productName: "딥 웜 테일러드 재킷", category: "outer", colorFamily: ["deep-brown"], materialTags: ["wool"], sizeSystem: "KR", availableSizes: ["95", "100", "105"],
      price: { amount: 189000, currency: "KRW" }, listPrice: null, availability: "in-stock", shipsToKorea: true, productUrl: "https://example.com/products/e2e-jacket", imageUrl: null,
      observedAt: "2026-08-08T00:05:00.000Z", expiresAt: "2026-08-09T00:05:00.000Z", sourceFingerprint: "e2e-offer-fingerprint",
    }],
  } : {};
  const initialReport = requested === "result" ? attachConsultationResultNarrative(projectConsultationReportV2(snapshot, reportSource), null) : null;
  if (requested === "makeup") return <ConsultationScene snapshot={snapshot} stage="makeup"><div className="pb-24 lg:h-full lg:overflow-y-auto">{query.simulation === "1" ? <MakeupSimulationFixture /> : query.interview === "1" ? <MakeupInterviewFixture /> : <MakeupDirectionFixture diagnostics={query.diagnostics === "1"} />}</div></ConsultationScene>;
  return <ConsultationStagePage initialSnapshot={snapshot} initialReport={initialReport} stage={requested} initialTransitionKind={isConsultationTaskKind(query.transition) ? query.transition : null} livenessEnabled={query.liveness === "1"} pollingEnabled={query.polling === "1"} interviewEnabled={query.interview === "1"} zeroInputIntakeEnabled={query.zeroInput !== "0"} hairRecommendationEnabled={query.hairRecommendation === "1"} />;
}
