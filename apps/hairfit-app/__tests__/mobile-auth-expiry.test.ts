import { recoverMobileAuthExpiry } from "../lib/mobile-auth-expiry";

describe("mobile authentication expiry recovery", () => {
  test("opens login and clears the stale session after a 401", async () => {
    const navigateToLogin = jest.fn();
    const signOut = jest.fn().mockResolvedValue(undefined);

    expect(recoverMobileAuthExpiry({ status: 401 }, { navigateToLogin, signOut })).toBe(true);
    expect(navigateToLogin).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  test("leaves non-authentication failures on the current screen", () => {
    const navigateToLogin = jest.fn();
    const signOut = jest.fn().mockResolvedValue(undefined);

    expect(recoverMobileAuthExpiry({ status: 503 }, { navigateToLogin, signOut })).toBe(false);
    expect(navigateToLogin).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  test("still opens login when stale-session cleanup fails", async () => {
    const navigateToLogin = jest.fn();
    const signOut = jest.fn().mockRejectedValue(new Error("cleanup failed"));

    expect(recoverMobileAuthExpiry({ status: 401 }, { navigateToLogin, signOut })).toBe(true);
    expect(navigateToLogin).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  });
});
