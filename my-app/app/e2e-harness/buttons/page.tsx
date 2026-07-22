import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonStabilityHarness } from "../../../components/e2e/ButtonStabilityHarness";

export const metadata: Metadata = {
  title: "Button E2E Harness",
  robots: { index: false, follow: false },
};

export default function ButtonE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return <ButtonStabilityHarness />;
}
