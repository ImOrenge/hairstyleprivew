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
  snapshot.discovery = { goals: ["얼굴 균형 보완"], currentHair: "어깨 길이의 자연 모발", desiredServices: ["커트"], maintenanceLevel: "medium", avoid: ["과한 볼륨"], notes: "" };
  snapshot.photo.generationId = "e2e-generation";
  snapshot.photo.quality = snapshot.photo.quality.map((item) => ({ ...item, status: "pass", message: "확인 완료" }));
  return <ConsultationStagePage initialSnapshot={snapshot} stage={requested} />;
}
