import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { ConsultationStagePage } from "../../../../components/consulting/ConsultationStagePage";
import { buildSignInRedirectUrl } from "../../../../lib/clerk";
import { isConsultationStage, isConsultationTaskKind } from "../../../../lib/consulting/contracts";
import { isAiLedHairDecisionEnabled, isColorStudioEnabled, isConsultationChapterNavigationEnabled, isConsultationDiscoveryInterviewEnabled, isConsultationFashionInterviewEnabled, isConsultationFrontendEnabled, isConsultationLivenessEnabled, isConsultationProgressiveInterviewEnabled, isConsultationResultEnabled, isConsultationZeroInputIntakeEnabled, isPersonalColorSceneEnabled } from "../../../../lib/consulting/feature-flag";
import { canEnterConsultationStage, consultationStageHref } from "../../../../lib/consulting/routes";
import { readConsultationReportV2 } from "../../../../lib/consulting/report-v2-server";
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
  const hairRecommendationEnabled = isAiLedHairDecisionEnabled();
  if (hairRecommendationEnabled && (rawStage === "compare" || rawStage === "decision")) {
    redirect(consultationStageHref(sessionId, "previews"));
  }
  const stageEnabled = (rawStage !== "personal-color" || isPersonalColorSceneEnabled())
    && (rawStage !== "color-studio" || isColorStudioEnabled())
    && (rawStage !== "result" || isConsultationResultEnabled());
  if (!stageEnabled) {
    const fallback = rawStage === "personal-color" ? "analysis" : rawStage === "color-studio" ? "salon-brief" : "fashion";
    redirect(consultationStageHref(sessionId, fallback));
  }
  let recommended = snapshot.journey.recommendedStage;
  if (recommended === "personal-color" && !isPersonalColorSceneEnabled()) recommended = "direction";
  if (recommended === "color-studio" && !isColorStudioEnabled()) recommended = "salon-brief";
  if (recommended === "result" && !isConsultationResultEnabled()) recommended = "fashion";
  if (!canEnterConsultationStage(snapshot, rawStage)) redirect(consultationStageHref(sessionId, recommended));
  const initialReport = rawStage === "result" ? await readConsultationReportV2({ userId, consultationId: sessionId, snapshot }) : null;
  return <ConsultationStagePage initialSnapshot={snapshot} initialReport={initialReport} stage={rawStage} initialTransitionKind={isConsultationTaskKind(query.transition) ? query.transition : null} livenessEnabled={isConsultationLivenessEnabled()} interviewEnabled={rawStage === "discovery" ? isConsultationDiscoveryInterviewEnabled() : rawStage === "fashion" ? isConsultationFashionInterviewEnabled() : false} progressiveInterviewEnabled={isConsultationProgressiveInterviewEnabled()} zeroInputIntakeEnabled={isConsultationZeroInputIntakeEnabled()} chapterNavigationEnabled={isConsultationChapterNavigationEnabled()} hairRecommendationEnabled={hairRecommendationEnabled} />;
}
