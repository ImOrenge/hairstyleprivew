import type { CustomerStylebookViewV2 } from "@hairfit/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerStylebookHarness } from "../../../components/e2e/CustomerStylebookHarness";

export const metadata: Metadata = {
  title: "Customer Stylebook E2E Harness",
  robots: { index: false, follow: false },
};

export default async function CustomerStylebookE2EPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; empty?: string }>;
}) {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") notFound();
  const query = await searchParams;
  const activeView: CustomerStylebookViewV2 = query.view === "fashion" ? "fashion" : "hair";
  return <CustomerStylebookHarness activeView={activeView} empty={query.empty === "1"} />;
}
