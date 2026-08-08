import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ConsultingEntry } from "../../../components/consulting/ConsultingEntry";
import { buildSignInRedirectUrl } from "../../../lib/clerk";
import { isConsultationFrontendEnabled } from "../../../lib/consulting/feature-flag";
import { readLatestServerConsultation } from "../../../lib/consulting/server-store";

export const metadata: Metadata = { title: "AI 헤어 컨설팅 시작", description: "HairFit AI 컨설턴트 11단계 여정을 시작합니다." };
export default async function NewConsultationPage() {
  if (!isConsultationFrontendEnabled()) redirect("/workspace");
  const { userId } = await auth();
  if (!userId) redirect(buildSignInRedirectUrl("/consulting/new"));
  return <ConsultingEntry latest={await readLatestServerConsultation(userId)} />;
}
