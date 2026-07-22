import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PersonalColorDiagnosisProgressHarness } from "../../../components/e2e/PersonalColorDiagnosisProgressHarness";

export const metadata: Metadata = {
  title: "Personal Color Progress E2E Harness",
  robots: { index: false, follow: false },
};

export default function PersonalColorDiagnosisProgressE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return <PersonalColorDiagnosisProgressHarness />;
}
