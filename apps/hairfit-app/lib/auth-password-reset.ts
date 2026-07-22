export interface PasswordResetEmailFactor {
  strategy: "reset_password_email_code";
  emailAddressId: string;
  safeIdentifier: string | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shortText(value: unknown, maxLength = 160) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export function findPasswordResetEmailFactor(value: unknown): PasswordResetEmailFactor | null {
  if (!Array.isArray(value)) return null;
  for (const candidate of value) {
    if (!isObject(candidate) || candidate.strategy !== "reset_password_email_code") continue;
    const emailAddressId = shortText(candidate.emailAddressId);
    if (!emailAddressId) continue;
    return {
      strategy: "reset_password_email_code",
      emailAddressId,
      safeIdentifier: shortText(candidate.safeIdentifier),
    };
  }
  return null;
}

export function validateNewPassword(input: {
  password: string;
  confirmation: string;
}) {
  if (!input.password.trim()) return "새 비밀번호를 입력해 주세요.";
  if (input.password.length < 8) return "새 비밀번호는 8자 이상 입력해 주세요.";
  if (input.password !== input.confirmation) return "새 비밀번호가 서로 일치하지 않습니다.";
  return null;
}
