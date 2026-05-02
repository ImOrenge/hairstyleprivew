import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { WorkspaceWizard } from "../../components/workspace/WorkspaceWizard";
import { AppPage } from "../../components/ui/Surface";
import { buildSignInRedirectUrl } from "../../lib/clerk";

export const metadata: Metadata = {
  title: "워크스페이스",
  description: "HairFit 헤어 생성 워크스페이스",
};

export default async function WorkspacePage() {
  const { userId } = await auth();
  if (!userId) {
    redirect(buildSignInRedirectUrl("/workspace"));
  }

  return (
    <AppPage className="flex flex-col gap-5 pb-24">
      <WorkspaceWizard />
    </AppPage>
  );
}
