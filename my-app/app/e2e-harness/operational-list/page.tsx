import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerListClient } from "../../../components/salon/CustomerListClient";

export const metadata: Metadata = {
  title: "Operational List E2E Harness",
  robots: { index: false, follow: false },
};

export default function OperationalListE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return (
    <main data-testid="operational-list-harness">
      <CustomerListClient />
    </main>
  );
}
