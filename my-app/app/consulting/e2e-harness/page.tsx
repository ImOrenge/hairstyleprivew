import { notFound } from "next/navigation";
import { ConsultationStagePage } from "../../../components/consulting/ConsultationStagePage";
import { CONSULTATION_STAGE_SLUGS, isConsultationStage } from "../../../lib/consulting/contracts";
import { createConsultationSnapshot } from "../../../lib/consulting/defaults";

export const metadata = { title: "Consulting Scene E2E Harness", robots: { index: false, follow: false } };
interface Props { searchParams: Promise<{ stage?: string }> }
export default async function ConsultingSceneHarnessPage({ searchParams }: Props) {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") notFound();
  const requested = (await searchParams).stage || "discovery";
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
  snapshot.strategyRecommendations = (["length", "fringe", "parting", "layerStart", "crownVolume", "sideVolume", "texture", "color"] as const).map((axis) => ({
    axis,
    recommendedValue: String(snapshot.strategy[axis]),
    evidenceId: axis === "color" ? "skin" : axis === "fringe" || axis === "parting" ? "hairline" : "contour",
    reason: "E2E 분석 근거",
    impact: "선택에 따른 예상 영향",
    tradeoff: "관리 조건과 함께 확인",
  }));
  snapshot.previews = snapshot.previews.map((preview, index) => index < 2 ? { ...preview, status: "accepted" } : preview);
  return <ConsultationStagePage initialSnapshot={snapshot} stage={requested} />;
}
