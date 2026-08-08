import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { ConsultationStagePage } from "../../../../components/consulting/ConsultationStagePage";
import { buildSignInRedirectUrl } from "../../../../lib/clerk";
import { isConsultationStage } from "../../../../lib/consulting/contracts";
import { isConsultationFrontendEnabled } from "../../../../lib/consulting/feature-flag";
import { canEnterConsultationStage, consultationStageHref } from "../../../../lib/consulting/routes";
import { readServerConsultation } from "../../../../lib/consulting/server-store";

export const metadata: Metadata = { title: "AI 헤어 컨설팅", description: "근거에서 선택과 관리까지 이어지는 HairFit AI 컨설팅." };
interface Props { params: Promise<{ sessionId: string; stage: string }> }
export default async function ConsultationStageRoute({ params }: Props) {
  if (!isConsultationFrontendEnabled()) redirect("/workspace");
  const { sessionId, stage: rawStage } = await params;
  if (!isConsultationStage(rawStage)) notFound();
  const { userId } = await auth();
  if (!userId) redirect(buildSignInRedirectUrl(consultationStageHref(sessionId, rawStage)));
  const snapshot = await readServerConsultation(userId, sessionId);
  if (!snapshot) notFound();
  if (!canEnterConsultationStage(snapshot, rawStage)) redirect(consultationStageHref(sessionId, snapshot.currentStage));
  return <ConsultationStagePage initialSnapshot={snapshot} stage={rawStage} />;
}
