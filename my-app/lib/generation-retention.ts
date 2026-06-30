import "server-only";

export const GENERATION_ASSETS_EXPIRED_MESSAGE = "생성 결과 보관기간이 만료되었습니다.";

export function isGeneratedAssetsExpired(value: unknown, now = new Date()) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  const expiresAt = new Date(value);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime();
}
