import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceFlowHarness } from "../../../components/e2e/WorkspaceFlowHarness";

export const metadata: Metadata = {
  title: "Workspace Flow E2E Harness",
  robots: { index: false, follow: false },
};

export default function WorkspaceFlowE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return <WorkspaceFlowHarness />;
}
