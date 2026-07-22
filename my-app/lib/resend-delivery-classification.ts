export function isAmbiguousResendDeliveryError(error: unknown) {
  if (!error || typeof error !== "object") return true;

  const candidate = error as Record<string, unknown>;
  const statusCode =
    typeof candidate.statusCode === "number" && Number.isFinite(candidate.statusCode)
      ? candidate.statusCode
      : null;
  const name = typeof candidate.name === "string" ? candidate.name : "";

  return (
    statusCode === null ||
    statusCode === 408 ||
    statusCode >= 500 ||
    name === "concurrent_idempotent_requests"
  );
}
