import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UploadValidationHarness } from "../../../components/e2e/UploadValidationHarness";

export const metadata: Metadata = {
  title: "Upload Validation E2E Harness",
  robots: { index: false, follow: false },
};

export default function UploadValidationE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return <UploadValidationHarness />;
}
