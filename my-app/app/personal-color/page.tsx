import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppPage } from "../../components/ui/Surface";
import { PersonalColorDiagnosisPageClient } from "../../components/personal-color/PersonalColorDiagnosisPageClient";
import { buildSignInRedirectUrl } from "../../lib/clerk";

export const metadata: Metadata = {
  title: "퍼스널컬러 진단",
  description: "HairFit 퍼스널컬러 진단",
};

export default async function PersonalColorPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect(buildSignInRedirectUrl("/personal-color"));
  }

  return (
    <AppPage className="flex flex-col gap-5 pb-24">
      <Suspense fallback={null}>
        <PersonalColorDiagnosisPageClient />
      </Suspense>
    </AppPage>
  );
}
