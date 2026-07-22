import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResultDecisionStabilityHarness } from "../../../components/e2e/ResultDecisionStabilityHarness";

export const metadata: Metadata = {
  title: "Result Decision E2E Harness",
  robots: { index: false, follow: false },
};

export default function ResultDecisionE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return <ResultDecisionStabilityHarness />;
}
