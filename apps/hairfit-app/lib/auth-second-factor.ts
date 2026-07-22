export type AuthSecondFactorStrategy =
  | "email_code"
  | "phone_code"
  | "totp"
  | "backup_code";

export interface AuthSecondFactorOption {
  strategy: AuthSecondFactorStrategy;
  factorId: string | null;
  safeIdentifier: string | null;
  label: string;
}

type JsonObject = Record<string, unknown>;

const STRATEGY_ORDER: AuthSecondFactorStrategy[] = [
  "email_code",
  "phone_code",
  "totp",
  "backup_code",
];

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shortText(value: unknown, maxLength = 160) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function isStrategy(value: unknown): value is AuthSecondFactorStrategy {
  return STRATEGY_ORDER.includes(value as AuthSecondFactorStrategy);
}

function optionLabel(
  strategy: AuthSecondFactorStrategy,
  safeIdentifier: string | null,
) {
  if (strategy === "email_code") {
    return safeIdentifier ? `이메일 코드 · ${safeIdentifier}` : "이메일 인증 코드";
  }
  if (strategy === "phone_code") {
    return safeIdentifier ? `문자 코드 · ${safeIdentifier}` : "문자 인증 코드";
  }
  if (strategy === "totp") return "인증 앱 코드";
  return "백업 코드";
}

export function normalizeAuthSecondFactorOptions(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<AuthSecondFactorStrategy>();
  const options: AuthSecondFactorOption[] = [];
  for (const candidate of value) {
    if (!isObject(candidate) || !isStrategy(candidate.strategy) || seen.has(candidate.strategy)) {
      continue;
    }

    const strategy = candidate.strategy;
    const factorId =
      strategy === "email_code"
        ? shortText(candidate.emailAddressId)
        : strategy === "phone_code"
          ? shortText(candidate.phoneNumberId)
          : null;
    if ((strategy === "email_code" || strategy === "phone_code") && !factorId) continue;

    const safeIdentifier = shortText(candidate.safeIdentifier);
    seen.add(strategy);
    options.push({
      strategy,
      factorId,
      safeIdentifier,
      label: optionLabel(strategy, safeIdentifier),
    });
  }

  return options.sort(
    (left, right) => STRATEGY_ORDER.indexOf(left.strategy) - STRATEGY_ORDER.indexOf(right.strategy),
  );
}

export function getAuthSecondFactorPrepareParams(option: AuthSecondFactorOption) {
  if (option.strategy === "email_code" && option.factorId) {
    return { strategy: "email_code" as const, emailAddressId: option.factorId };
  }
  if (option.strategy === "phone_code" && option.factorId) {
    return { strategy: "phone_code" as const, phoneNumberId: option.factorId };
  }
  return null;
}

export function getAuthSecondFactorAttemptParams(
  option: AuthSecondFactorOption,
  code: unknown,
) {
  const normalizedCode = shortText(code, 128);
  return normalizedCode ? { strategy: option.strategy, code: normalizedCode } : null;
}

export function authSecondFactorInstruction(option: AuthSecondFactorOption) {
  if (option.strategy === "email_code") return "이메일로 받은 인증 코드를 입력해 주세요.";
  if (option.strategy === "phone_code") return "문자로 받은 인증 코드를 입력해 주세요.";
  if (option.strategy === "totp") return "인증 앱에 표시된 코드를 입력해 주세요.";
  return "보관 중인 백업 코드 하나를 입력해 주세요.";
}
