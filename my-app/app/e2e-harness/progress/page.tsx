import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GenerationProgressHarness } from "../../../components/e2e/GenerationProgressHarness";

export const metadata: Metadata = {
  title: "Generation Progress E2E Harness",
  robots: { index: false, follow: false },
};

export default function GenerationProgressE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return <GenerationProgressHarness />;
}
