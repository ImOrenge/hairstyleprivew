import {
  MOBILE_AUTH_RETRY_LIMIT,
  resolveMobileAuthRecovery,
} from "../lib/mobile-auth-expiry";

describe("mobile authentication expiry recovery", () => {
  test("retries the first authenticated 401 without deleting the active session", () => {
    expect(resolveMobileAuthRecovery({ status: 401 }, 0)).toBe("retry");
  });

  test("requires an explicit reconnect after the bounded retry is exhausted", () => {
    expect(resolveMobileAuthRecovery({ status: 401 }, MOBILE_AUTH_RETRY_LIMIT)).toBe("reconnect");
  });

  test("leaves non-authentication failures on the current screen", () => {
    expect(resolveMobileAuthRecovery({ status: 503 }, 0)).toBe("ignore");
  });
});
