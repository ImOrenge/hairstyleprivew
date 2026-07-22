export type MobileUserErrorContext = "default" | "photo";

function readStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

export function isMobileAuthExpired(error: unknown) {
  return readStatus(error) === 401;
}

function readErrorName(error: unknown) {
  if (!error || typeof error !== "object" || !("name" in error)) return null;
  return typeof error.name === "string" ? error.name : null;
}

export function mapMobileUserError(
  error: unknown,
  fallbackMessage: string,
  context: MobileUserErrorContext = "default",
) {
  const status = readStatus(error);

  if (isMobileAuthExpired(error)) {
    return "로그인이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.";
  }
  if (status === 403) {
    return "이 작업을 수행할 권한이 없습니다. 사용 중인 계정을 확인해 주세요.";
  }
  if (status === 413 && context === "photo") {
    return "사진 용량이 너무 큽니다. 더 작은 사진을 선택해 주세요.";
  }
  if (status === 415 && context === "photo") {
    return "JPEG, PNG, WebP 형식의 사진만 선택할 수 있습니다.";
  }
  if (status === 429) {
    return "요청이 많아 잠시 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (status !== null && status >= 500) {
    return "서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (readErrorName(error) === "TypeError") {
    return "네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
  }

  return fallbackMessage;
}
