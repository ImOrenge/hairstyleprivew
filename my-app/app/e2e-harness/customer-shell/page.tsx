import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerShellHarness } from "../../../components/e2e/CustomerShellHarness";

export const metadata: Metadata = {
  title: "Customer Shell E2E Harness",
  robots: { index: false, follow: false },
};

export default async function CustomerShellE2EPage({ searchParams }: { searchParams: Promise<{ look?: string }> }) {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") notFound();
  const query = await searchParams;
  return <CustomerShellHarness confirmedLook={query.look !== "none"} />;
}
