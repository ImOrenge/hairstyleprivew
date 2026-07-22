import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormFeedbackStabilityHarness } from "../../../components/e2e/FormFeedbackStabilityHarness";

export const metadata: Metadata = {
  title: "Form and Feedback E2E Harness",
  robots: { index: false, follow: false },
};

export default function FormFeedbackE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return <FormFeedbackStabilityHarness />;
}
