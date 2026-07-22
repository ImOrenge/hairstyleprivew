import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SurfaceStabilityHarness } from "../../../components/e2e/SurfaceStabilityHarness";

export const metadata: Metadata = {
  title: "Surface E2E Harness",
  robots: { index: false, follow: false },
};

export default function SurfaceE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return <SurfaceStabilityHarness />;
}
