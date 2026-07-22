export const DEFAULT_GENERATION_RETRY_PATH = "/generate";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SALON_RETRY_PATH_PATTERN =
  /^\/salon\/customers\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/workspace$/i;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeGenerationRetryPath(value: unknown): string {
  if (value === DEFAULT_GENERATION_RETRY_PATH) return DEFAULT_GENERATION_RETRY_PATH;
  if (typeof value !== "string") return DEFAULT_GENERATION_RETRY_PATH;

  const match = value.match(SALON_RETRY_PATH_PATTERN);
  return match
    ? `/salon/customers/${match[1].toLowerCase()}/workspace`
    : DEFAULT_GENERATION_RETRY_PATH;
}

export function getGenerationRetryPath(options: unknown): string {
  const salonContext = objectValue(objectValue(options)?.salonContext);
  const customerId = typeof salonContext?.customerId === "string"
    ? salonContext.customerId.trim()
    : "";

  if (salonContext?.mode === "salon-crm-workspace" && UUID_PATTERN.test(customerId)) {
    return `/salon/customers/${customerId.toLowerCase()}/workspace`;
  }
  return DEFAULT_GENERATION_RETRY_PATH;
}
