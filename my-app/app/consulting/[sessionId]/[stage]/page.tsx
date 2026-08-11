import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { ConsultationStagePage } from "../../../../components/consulting/ConsultationStagePage";
import { buildSignInRedirectUrl } from "../../../../lib/clerk";
import { isConsultationStage, isConsultationTaskKind } from "../../../../lib/consulting/contracts";
import { isConsultationDiscoveryInterviewEnabled, isConsultationFashionInterviewEnabled, isConsultationFrontendEnabled, isConsultationLivenessEnabled } from "../../../../lib/consulting/feature-flag";
import { canEnterConsultationStage, consultationStageHref } from "../../../../lib/consulting/routes";
import { readServerConsultation } from "../../../../lib/consulting/server-store";

export const metadata: Metadata = { title: "AI 헤어 컨설팅", description: "근거에서 선택과 관리까지 이어지는 HairFit AI 컨설팅." };
interface Props { params: Promise<{ sessionId: string; stage: string }>; searchParams: Promise<{ transition?: string }> }
export default async function ConsultationStageRoute({ params, searchParams }: Props) {
  if (!isConsultationFrontendEnabled()) redirect("/workspace");
  const [{ sessionId, stage: rawStage }, query] = await Promise.all([params, searchParams]);
  if (!isConsultationStage(rawStage)) notFound();
  const { userId } = await auth();
  if (!userId) redirect(buildSignInRedirectUrl(consultationStageHref(sessionId, rawStage)));
  const snapshot = await readServerConsultation(userId, sessionId);
  if (!snapshot) notFound();
  if (!canEnterConsultationStage(snapshot, rawStage)) redirect(consultationStageHref(sessionId, snapshot.journey.recommendedStage));
  return <ConsultationStagePage initialSnapshot={snapshot} stage={rawStage} initialTransitionKind={isConsultationTaskKind(query.transition) ? query.transition : null} livenessEnabled={isConsultationLivenessEnabled()} interviewEnabled={rawStage === "discovery" ? isConsultationDiscoveryInterviewEnabled() : rawStage === "fashion" ? isConsultationFashionInterviewEnabled() : false} />;
}
