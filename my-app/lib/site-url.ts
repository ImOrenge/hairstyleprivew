const LOCAL_SITE_URL = "http://localhost:3000";
const PRODUCTION_SITE_URL = "https://hairfit.beauty";

export function getSiteUrl(
  environment: Record<string, string | undefined> = process.env,
) {
  const fallbackUrl = environment.NODE_ENV === "production"
    ? PRODUCTION_SITE_URL
    : LOCAL_SITE_URL;
  const rawUrl = environment.NEXT_PUBLIC_SITE_URL?.trim() || fallbackUrl;

  try {
    const parsed = new URL(rawUrl);
    const supportedProtocol = parsed.protocol === "http:" || parsed.protocol === "https:";
    const productionProtocol = environment.NODE_ENV !== "production" || parsed.protocol === "https:";
    return supportedProtocol && productionProtocol && parsed.origin !== "null"
      ? parsed.origin
      : fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}
