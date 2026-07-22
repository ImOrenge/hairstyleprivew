import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaidActionQuoteHarness } from "../../../components/e2e/PaidActionQuoteHarness";

export const metadata: Metadata = {
  title: "Paid Action Quote E2E Harness",
  robots: { index: false, follow: false },
};

export default function PaidActionQuoteE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return <PaidActionQuoteHarness />;
}
