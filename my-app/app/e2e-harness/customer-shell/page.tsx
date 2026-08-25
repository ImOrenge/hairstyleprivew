import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerShellHarness } from "../../../components/e2e/CustomerShellHarness";

export const metadata: Metadata = {
  title: "Customer Shell E2E Harness",
  robots: { index: false, follow: false },
};

export default function CustomerShellE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") notFound();
  return <CustomerShellHarness />;
}
