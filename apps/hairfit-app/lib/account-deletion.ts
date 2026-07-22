import { pendingResumeStore, type PendingResumeStore } from "./auth-resume";
import { paymentResumeStore, type PaymentResumeStore } from "./payment-resume";
import { clearGenerationPushAccountState } from "./push-notifications";

export async function clearDeletedAccountLocalState(input: {
  customerId: string;
  signOut: () => Promise<unknown>;
  authResumeStore?: PendingResumeStore;
  paymentStore?: PaymentResumeStore;
  clearPushState?: () => Promise<void>;
}) {
  const authResumeStore = input.authResumeStore ?? pendingResumeStore;
  const paymentStore = input.paymentStore ?? paymentResumeStore;
  const clearPushState = input.clearPushState ?? clearGenerationPushAccountState;

  const cleanup = await Promise.allSettled([
    authResumeStore.clear(),
    paymentStore.purge(input.customerId),
    clearPushState(),
  ]);

  // Clerk can reject sign-out after the server has already deleted the user.
  // Local privacy cleanup must still complete and navigation must continue.
  const signOutCompleted = await input.signOut().then(
    () => true,
    () => false,
  );

  return {
    localCleanupCompleted: cleanup.every((result) => result.status === "fulfilled"),
    signOutCompleted,
  };
}
