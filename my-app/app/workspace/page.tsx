import type { Metadata } from "next";
import { Suspense } from "react";
import { resolveGenerationEntryDecision } from "@hairfit/shared/auth/generation-entry";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { WorkspaceWizard } from "../../components/workspace/WorkspaceWizard";
import { AppPage } from "../../components/ui/Surface";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { loadGenerationEntryAccountState } from "../../lib/generation-entry-server";

export const metadata: Metadata = {
  title: "워크스페이스",
  description: "HairFit 헤어 생성 워크스페이스",
  alternates: { canonical: "/workspace" },
  robots: { index: false, follow: false },
};

type WorkspacePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const params = (await searchParams) ?? {};
  const nextStep = Array.isArray(params.nextStep) ? params.nextStep[0] : params.nextStep;
  const { userId } = await auth();
  if (!userId) {
    const returnPath = nextStep === "generate"
      ? "/workspace?nextStep=generate"
      : "/workspace";
    redirect(buildSignInRedirectUrl(returnPath));
  }

  const accountState = await loadGenerationEntryAccountState(userId);
  const entryDecision = resolveGenerationEntryDecision({
    ...accountState,
    continuation: nextStep === "generate" ? "generation-submit" : "generation-upload",
  });
  if (entryDecision.kind !== "allow") {
    redirect(entryDecision.path);
  }

  return (
    <AppPage className="flex flex-col gap-5 pb-24">
      <Suspense fallback={null}>
        <WorkspaceWizard />
      </Suspense>
    </AppPage>
  );
}
