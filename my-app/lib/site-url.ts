const FALLBACK_SITE_URL = "http://localhost:3000";

export function getSiteUrl() {
  const rawUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || FALLBACK_SITE_URL;

  try {
    return new URL(rawUrl).origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}
