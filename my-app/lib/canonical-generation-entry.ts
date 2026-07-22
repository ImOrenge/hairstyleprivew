export const CANONICAL_GENERATION_ENTRY_PATH = "/workspace";
export const CANONICAL_GENERATION_STEP_PATH = "/workspace?nextStep=generate";

export type LegacyGenerationEntrySource = "upload" | "generate";

function normalizeLegacyPathname(pathname: string) {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function getLegacyGenerationEntrySource(
  pathname: string,
): LegacyGenerationEntrySource | null {
  const normalized = normalizeLegacyPathname(pathname);
  if (normalized === "/upload") return "upload";
  if (normalized === "/generate") return "generate";
  return null;
}

export function getCanonicalGenerationEntryPath(pathname: string): string | null {
  const source = getLegacyGenerationEntrySource(pathname);
  if (source === "upload") return CANONICAL_GENERATION_ENTRY_PATH;
  if (source === "generate") return CANONICAL_GENERATION_STEP_PATH;
  return null;
}
