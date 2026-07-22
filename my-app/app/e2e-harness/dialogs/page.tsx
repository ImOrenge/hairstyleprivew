import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DialogInteractionHarness } from "../../../components/e2e/DialogInteractionHarness";
import { getSubscriptionAccessMode } from "../../../lib/subscription-access";

export const metadata: Metadata = {
  title: "Dialog E2E Harness",
  robots: { index: false, follow: false },
};

export default function DialogE2EPage() {
  if (process.env.E2E_UI_HARNESS_ENABLED !== "true") {
    notFound();
  }

  return (
    <DialogInteractionHarness
      renderSubscriptionNotice={getSubscriptionAccessMode() !== "waitlist"}
    />
  );
}
