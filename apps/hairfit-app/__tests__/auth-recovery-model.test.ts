import {
  authSecondFactorInstruction,
  getAuthSecondFactorAttemptParams,
  getAuthSecondFactorPrepareParams,
  normalizeAuthSecondFactorOptions,
} from "../lib/auth-second-factor";
import {
  findPasswordResetEmailFactor,
  validateNewPassword,
} from "../lib/auth-password-reset";

describe("auth recovery model", () => {
  test("normalizes supported MFA factors into a stable, deduplicated order", () => {
    const options = normalizeAuthSecondFactorOptions([
      { strategy: "backup_code" },
      { strategy: "totp" },
      { strategy: "email_code", emailAddressId: "idn_email", safeIdentifier: "m***@test.dev" },
      { strategy: "email_code", emailAddressId: "duplicate" },
      { strategy: "phone_code", phoneNumberId: "idn_phone", safeIdentifier: "+82 ******1234" },
      { strategy: "unknown" },
    ]);

    expect(options.map((option) => option.strategy)).toEqual([
      "email_code",
      "phone_code",
      "totp",
      "backup_code",
    ]);
    expect(options[0]?.label).toBe("이메일 코드 · m***@test.dev");
  });

  test("builds only the provider parameters required by each MFA factor", () => {
    const [email, phone, totp] = normalizeAuthSecondFactorOptions([
      { strategy: "email_code", emailAddressId: "idn_email" },
      { strategy: "phone_code", phoneNumberId: "idn_phone" },
      { strategy: "totp" },
    ]);

    expect(getAuthSecondFactorPrepareParams(email!)).toEqual({
      emailAddressId: "idn_email",
      strategy: "email_code",
    });
    expect(getAuthSecondFactorPrepareParams(phone!)).toEqual({
      phoneNumberId: "idn_phone",
      strategy: "phone_code",
    });
    expect(getAuthSecondFactorPrepareParams(totp!)).toBeNull();
    expect(getAuthSecondFactorAttemptParams(totp!, " 123456 ")).toEqual({
      code: "123456",
      strategy: "totp",
    });
    expect(getAuthSecondFactorAttemptParams(totp!, " ")).toBeNull();
    expect(authSecondFactorInstruction(totp!)).toContain("인증 앱");
  });

  test("accepts only the Clerk email reset factor and validates the new password pair", () => {
    expect(findPasswordResetEmailFactor([
      { strategy: "password" },
      {
        strategy: "reset_password_email_code",
        emailAddressId: "idn_reset",
        safeIdentifier: "m***@test.dev",
      },
    ])).toEqual({
      strategy: "reset_password_email_code",
      emailAddressId: "idn_reset",
      safeIdentifier: "m***@test.dev",
    });
    expect(findPasswordResetEmailFactor([{ strategy: "reset_password_email_code" }])).toBeNull();
    expect(validateNewPassword({ password: "short", confirmation: "short" })).toContain("8자");
    expect(validateNewPassword({ password: "new-secret", confirmation: "different" })).toContain("일치");
    expect(validateNewPassword({ password: "new-secret", confirmation: "new-secret" })).toBeNull();
  });
});
