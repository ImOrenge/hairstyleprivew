const MEDIA_API_PREFIXES = [
  "/api/consultations",
  "/api/generations",
  "/api/styling",
  "/api/v2/consultations",
];

const MEDIA_API_EXACT_PATHS = new Set([
  "/api/mobile/stylebook",
  "/api/personal-color/analyze",
  "/api/style-profile/body-photo",
]);

function isPathOrDescendant(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function classifyServerRoute(pathname) {
  if (
    isPathOrDescendant(pathname, "/admin") ||
    isPathOrDescendant(pathname, "/api/admin") ||
    pathname === "/.well-known/hairfit-admin-deployment"
  ) {
    return "admin";
  }

  if (
    MEDIA_API_EXACT_PATHS.has(pathname) ||
    MEDIA_API_PREFIXES.some((prefix) => isPathOrDescendant(pathname, prefix)) ||
    isPathOrDescendant(pathname, "/aftercare") ||
    isPathOrDescendant(pathname, "/api/mobile/aftercare") ||
    isPathOrDescendant(pathname, "/api/stylebook-shares") ||
    pathname === "/consulting/new" ||
    pathname.startsWith("/consulting/share/") ||
    /^\/consulting\/[^/]+\/[^/]+\/?$/.test(pathname) ||
    /^\/generate\/[^/]+\/?$/.test(pathname) ||
    /^\/result\/[^/]+\/?$/.test(pathname) ||
    /^\/result\/v2\/[^/]+\/?$/.test(pathname) ||
    isPathOrDescendant(pathname, "/stylebook") ||
    (/^\/styler\/[^/]+\/?$/.test(pathname) && !isPathOrDescendant(pathname, "/styler/new")) ||
    pathname === "/.well-known/hairfit-media-deployment"
  ) {
    return "media";
  }

  return "default";
}
