import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SubscriptionPolicyHarness } from "../../../components/e2e/SubscriptionPolicyHarness";

export const metadata: Metadata = {
  title: "Subscription Policy E2E Harness",
  robots: { index: false, follow: false },
};

export default function SubscriptionPolicyE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return <SubscriptionPolicyHarness />;
}
