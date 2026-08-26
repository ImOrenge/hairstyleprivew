import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { buildSignInRedirectUrl } from "../../../../lib/clerk";
import { consultationStageHref } from "../../../../lib/consulting/routes";
import { loadCustomerStyleResultConsultationV2 } from "../../../../lib/v2/customer-history-server";

interface Params {
  params: Promise<{ selectionId: string }>;
}

export default async function CustomerStyleResultV2RedirectPage({ params }: Params) {
  const { selectionId } = await params;
  const returnPath = `/result/v2/${encodeURIComponent(selectionId)}`;
  const { userId } = await auth();
  if (!userId) redirect(buildSignInRedirectUrl(returnPath));

  const consultationId = await loadCustomerStyleResultConsultationV2(userId, selectionId);
  if (!consultationId) notFound();
  redirect(consultationStageHref(consultationId, "result"));
}
