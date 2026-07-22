import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SubscriptionWaitlistHarness } from "../../../components/e2e/SubscriptionWaitlistHarness";

export const metadata: Metadata = {
  title: "Subscription Waitlist E2E Harness",
  robots: { index: false, follow: false },
};

export default function SubscriptionWaitlistE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return <SubscriptionWaitlistHarness />;
}
