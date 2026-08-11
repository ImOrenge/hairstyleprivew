import { notFound } from "next/navigation";
import { ConsultationStagePage } from "../../../components/consulting/ConsultationStagePage";
import { CONSULTATION_STAGE_SLUGS, isConsultationStage, isConsultationTaskKind } from "../../../lib/consulting/contracts";
import { createConsultationSnapshot } from "../../../lib/consulting/defaults";
import { deriveConsultationJourney } from "../../../lib/consulting/contracts";

export const metadata = { title: "Consulting Scene E2E Harness", robots: { index: false, follow: false } };
interface Props { searchParams: Promise<{ stage?: string; transition?: string; liveness?: string; transitionState?: string; polling?: string; interview?: string }> }
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
  snapshot.previews = snapshot.previews.map((preview, index) => index < 2 ? { ...preview, status: "accepted" } : preview);
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
  return <ConsultationStagePage initialSnapshot={snapshot} stage={requested} initialTransitionKind={isConsultationTaskKind(query.transition) ? query.transition : null} livenessEnabled={query.liveness === "1"} pollingEnabled={query.polling === "1"} interviewEnabled={query.interview === "1"} />;
}
