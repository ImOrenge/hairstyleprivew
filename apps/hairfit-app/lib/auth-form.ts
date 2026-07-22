export type AuthFormField = "email" | "password" | "code";

export type AuthFieldErrors = Partial<Record<AuthFormField, string>>;

export interface AuthValidationResult {
  errors: AuthFieldErrors;
  firstInvalidField: AuthFormField | null;
}

interface ClerkLikeError {
  errors?: {
    code?: unknown;
    meta?: { paramName?: unknown };
  }[];
}

function requiredErrors(entries: { field: AuthFormField; value: string; message: string }[]) {
  const errors: AuthFieldErrors = {};
  let firstInvalidField: AuthFormField | null = null;

  for (const entry of entries) {
    if (entry.value.trim()) continue;
    errors[entry.field] = entry.message;
    firstInvalidField ??= entry.field;
  }

  return { errors, firstInvalidField };
}

export function validateLoginFields(input: { email: string; password: string }): AuthValidationResult {
  return requiredErrors([
    { field: "email", message: "이메일을 입력해 주세요.", value: input.email },
    { field: "password", message: "비밀번호를 입력해 주세요.", value: input.password },
  ]);
}

export function validateSignupFields(input: {
  code: string;
  email: string;
  needsCode: boolean;
  password: string;
}): AuthValidationResult {
  if (input.needsCode) {
    return requiredErrors([
      { field: "code", message: "이메일로 받은 인증 코드를 입력해 주세요.", value: input.code },
    ]);
  }

  return requiredErrors([
    { field: "email", message: "이메일을 입력해 주세요.", value: input.email },
    { field: "password", message: "비밀번호를 입력해 주세요.", value: input.password },
  ]);
}

export function mapAuthFormError(
  error: unknown,
  fallbackMessage: string,
): { field: AuthFormField | null; message: string } {
  const firstError = typeof error === "object" && error !== null && "errors" in error
    ? (error as ClerkLikeError).errors?.[0]
    : undefined;
  const code = typeof firstError?.code === "string" ? firstError.code.toLowerCase() : "";
  const paramName = typeof firstError?.meta?.paramName === "string"
    ? firstError.meta.paramName.toLowerCase()
    : "";
  const classification = `${code} ${paramName}`;

  if (classification.includes("verification") || classification.includes("code")) {
    return { field: "code", message: "인증 코드가 올바른지 확인하고 다시 입력해 주세요." };
  }
  if (classification.includes("password")) {
    return { field: "password", message: "비밀번호를 확인하고 다시 입력해 주세요." };
  }
  if (classification.includes("identifier") || classification.includes("email")) {
    return { field: "email", message: "이메일 주소를 확인하고 다시 입력해 주세요." };
  }

  return { field: null, message: fallbackMessage };
}
