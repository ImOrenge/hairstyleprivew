import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AsyncBoundaryStabilityHarness } from "../../../components/e2e/AsyncBoundaryStabilityHarness";

export const metadata: Metadata = {
  title: "AsyncBoundary E2E Harness",
  robots: { index: false, follow: false },
};

export default function AsyncBoundaryE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return <AsyncBoundaryStabilityHarness />;
}
