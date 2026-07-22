const GENERATION_RESUME_PREFIX = "generation:";
const SALON_MATCH_RESUME_PREFIX = "salon-match:";
const MAX_SERIALIZED_RESUME_TARGET_LENGTH = 96;
const MAX_RESUME_PATH_LENGTH = 160;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SALON_INVITE_CODE_PATTERN = /^[a-z0-9_-]{12,64}$/i;

export type ResumeTarget =
  | Readonly<{
      kind: "generation";
      generationId: string;
    }>
  | Readonly<{
      kind: "salon-match";
      inviteCode: string;
    }>;

export type GenerationResumePath = `/generate/${string}`;
export type SalonMatchResumePath = `/salon/match/${string}`;
export type ResumeTargetPath = GenerationResumePath | SalonMatchResumePath;

function normalizeGenerationId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export function createGenerationResumeTarget(generationId: unknown): ResumeTarget | null {
  const normalizedGenerationId = normalizeGenerationId(generationId);
  if (!normalizedGenerationId) return null;

  return {
    kind: "generation",
    generationId: normalizedGenerationId,
  };
}

export function createSalonMatchResumeTarget(inviteCode: unknown): ResumeTarget | null {
  if (typeof inviteCode !== "string") return null;
  const normalizedInviteCode = inviteCode.trim();
  if (!SALON_INVITE_CODE_PATTERN.test(normalizedInviteCode)) return null;

  return {
    kind: "salon-match",
    inviteCode: normalizedInviteCode,
  };
}

export function serializeResumeTarget(target: ResumeTarget | null | undefined) {
  if (!target) return null;

  if (target.kind === "generation") {
    const normalized = createGenerationResumeTarget(target.generationId);
    return normalized?.kind === "generation"
      ? `${GENERATION_RESUME_PREFIX}${normalized.generationId}`
      : null;
  }

  const normalized = createSalonMatchResumeTarget(target.inviteCode);
  return normalized?.kind === "salon-match"
    ? `${SALON_MATCH_RESUME_PREFIX}${normalized.inviteCode}`
    : null;
}

export function parseResumeTarget(value: unknown): ResumeTarget | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_SERIALIZED_RESUME_TARGET_LENGTH) return null;
  if (normalized.startsWith(GENERATION_RESUME_PREFIX)) {
    return createGenerationResumeTarget(normalized.slice(GENERATION_RESUME_PREFIX.length));
  }
  if (normalized.startsWith(SALON_MATCH_RESUME_PREFIX)) {
    return createSalonMatchResumeTarget(normalized.slice(SALON_MATCH_RESUME_PREFIX.length));
  }

  return null;
}

export function resumeTargetToPath(target: ResumeTarget | null | undefined): ResumeTargetPath | null {
  const serialized = serializeResumeTarget(target);
  if (!serialized) return null;

  const normalized = parseResumeTarget(serialized);
  if (!normalized) return null;
  return normalized.kind === "generation"
    ? `/generate/${normalized.generationId}`
    : `/salon/match/${encodeURIComponent(normalized.inviteCode)}`;
}

export function parseResumeTargetPath(value: unknown): ResumeTarget | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_RESUME_PATH_LENGTH) return null;
  if (normalized.includes("\\") || normalized.includes("?") || normalized.includes("#")) return null;

  const generationMatch = /^\/generate\/([^/]+)$/.exec(normalized);
  const salonMatch = /^\/salon\/match\/([^/]+)$/.exec(normalized);
  if (!generationMatch && !salonMatch) return null;

  let identifier: string;
  try {
    identifier = decodeURIComponent((generationMatch ?? salonMatch)?.[1] ?? "");
  } catch {
    return null;
  }

  return generationMatch
    ? createGenerationResumeTarget(identifier)
    : createSalonMatchResumeTarget(identifier);
}

export function validateResumeTargetPath(value: unknown): ResumeTargetPath | null {
  return resumeTargetToPath(parseResumeTargetPath(value));
}
