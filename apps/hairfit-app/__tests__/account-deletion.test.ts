import { clearDeletedAccountLocalState } from "../lib/account-deletion";

jest.mock("../lib/push-notifications", () => ({
  clearGenerationPushAccountState: jest.fn(async () => undefined),
}));

describe("deleted account local cleanup", () => {
  test("clears auth resume, account-scoped payment resume, push state, and signs out", async () => {
    const authResumeStore = { clear: jest.fn(async () => undefined) };
    const paymentStore = { purge: jest.fn(async () => true) };
    const clearPushState = jest.fn(async () => undefined);
    const signOut = jest.fn(async () => undefined);

    await expect(clearDeletedAccountLocalState({
      customerId: "user_deleted_account",
      signOut,
      authResumeStore: authResumeStore as never,
      paymentStore: paymentStore as never,
      clearPushState,
    })).resolves.toEqual({
      localCleanupCompleted: true,
      signOutCompleted: true,
    });

    expect(authResumeStore.clear).toHaveBeenCalledTimes(1);
    expect(paymentStore.purge).toHaveBeenCalledWith("user_deleted_account");
    expect(clearPushState).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  test("continues every privacy cleanup step when one local store or Clerk sign-out fails", async () => {
    const authResumeStore = { clear: jest.fn(async () => {
      throw new Error("secure store unavailable");
    }) };
    const paymentStore = { purge: jest.fn(async () => true) };
    const clearPushState = jest.fn(async () => undefined);
    const signOut = jest.fn(async () => {
      throw new Error("identity already deleted");
    });

    await expect(clearDeletedAccountLocalState({
      customerId: "user_deleted_account",
      signOut,
      authResumeStore: authResumeStore as never,
      paymentStore: paymentStore as never,
      clearPushState,
    })).resolves.toEqual({
      localCleanupCompleted: false,
      signOutCompleted: false,
    });

    expect(paymentStore.purge).toHaveBeenCalledTimes(1);
    expect(clearPushState).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
