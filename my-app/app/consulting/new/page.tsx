import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsultingEntry } from "../../../components/consulting/ConsultingEntry";
import { ConsultationRouteRecovery } from "../../../components/consulting/ConsultationRouteRecovery";
import { buildSignInRedirectUrl } from "../../../lib/clerk";
import { CONSULTATION_STAGE_SLUGS } from "../../../lib/consulting/contracts";
import { isConsultationFrontendEnabled } from "../../../lib/consulting/feature-flag";
import { loadConsultationRouteData, readConsultationRouteUserId } from "../../../lib/consulting/route-server";
import { readLatestServerConsultation } from "../../../lib/consulting/server-store";

export const metadata: Metadata = {
  title: "AI 헤어 컨설팅 시작",
  description: `HairFit AI 컨설턴트 ${CONSULTATION_STAGE_SLUGS.length}단계 여정을 시작합니다.`,
};
export default async function NewConsultationPage() {
  if (!isConsultationFrontendEnabled()) redirect("/workspace");
  const userId = await readConsultationRouteUserId();
  if (!userId) redirect(buildSignInRedirectUrl("/consulting/new"));
  const latest = await loadConsultationRouteData(
    "read-latest-consultation",
    () => readLatestServerConsultation(userId),
  );
  if (!latest.ok) return <ConsultationRouteRecovery retryHref="/consulting/new" />;
  return <ConsultingEntry latest={latest.data} />;
}
