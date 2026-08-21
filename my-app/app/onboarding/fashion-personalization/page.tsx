import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { FashionPersonalizationForm } from "../../../components/onboarding/FashionPersonalizationForm";
import { normalizeAppPath } from "../../../lib/onboarding";

interface Props { searchParams: Promise<{ returnTo?: string }> }

export default async function FashionPersonalizationPage({ searchParams }: Props) {
  const { userId } = await auth();
  const query = await searchParams;
  const returnTo = normalizeAppPath(query.returnTo, "/mypage?tab=body-profile");
  if (!userId) redirect(`/login?redirect_url=${encodeURIComponent(`/onboarding/fashion-personalization?returnTo=${encodeURIComponent(returnTo)}`)}`);
  return <FashionPersonalizationForm returnTo={returnTo} />;
}
