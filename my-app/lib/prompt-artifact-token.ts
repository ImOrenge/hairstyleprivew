import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

interface PromptArtifactTokenPayload {
  sub: string;
  ph: string;
  prh: string;
  rrh: string;
  model: string;
  pv: string;
  iat: number;
  exp: number;
  jti: string;
}

interface CreatePromptArtifactTokenInput {
  userId: string;
  prompt: string;
  productRequirements?: string | null;
  researchReport?: string | null;
  model: string;
  promptVersion: string;
}

interface VerifyPromptArtifactTokenInput {
  token: string;
  userId: string;
  prompt: string;
  productRequirements?: string | null;
  researchReport?: string | null;
}

interface VerifyPromptArtifactTokenResult {
  ok: boolean;
  error?: string;
  payload?: PromptArtifactTokenPayload;
}

const TOKEN_HEADER = { alg: "HS256", typ: "JWT" } as const;
const TOKEN_TTL_SECONDS = 60 * 60;

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const restored = padded + "=".repeat((4 - (padded.length % 4 || 4)) % 4);
  return Buffer.from(restored, "base64").toString("utf8");
}

function normalizeForHash(value?: string | null): string {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function sha256Base64Url(value?: string | null): string {
  return createHash("sha256").update(normalizeForHash(value), "utf8").digest("base64url");
}

function getSigningSecret(): string {
  const candidates = [
    process.env.INTERNAL_API_SECRET,
    process.env.CLERK_SECRET_KEY,
  ];
  const secret = candidates
    .map((value) => value?.trim())
    .find((value) => value && !value.includes("YOUR_"));

  if (!secret) {
    console.error("[auth] Missing signing secret: Both INTERNAL_API_SECRET and CLERK_SECRET_KEY are unset or invalid.");
    throw new Error("Missing signing secret for prompt artifact token. Please check your environment variables.");
  }

  return secret;
}

function signSegment(segment: string): string {
  return createHmac("sha256", getSigningSecret()).update(segment, "utf8").digest("base64url");
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return timingSafeEqual(aBuf, bBuf);
}

export function createPromptArtifactToken(input: CreatePromptArtifactTokenInput): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: PromptArtifactTokenPayload = {
    sub: input.userId,
    ph: sha256Base64Url(input.prompt),
    prh: sha256Base64Url(input.productRequirements),
    rrh: sha256Base64Url(input.researchReport),
    model: input.model,
    pv: input.promptVersion,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    jti: randomBytes(8).toString("hex"),
  };

  const encodedHeader = toBase64Url(JSON.stringify(TOKEN_HEADER));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = signSegment(unsignedToken);
  return `${unsignedToken}.${signature}`;
}

export function verifyPromptArtifactToken(
  input: VerifyPromptArtifactTokenInput,
): VerifyPromptArtifactTokenResult {
  const token = input.token.trim();
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "Malformed token" };
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) {
    return { ok: false, error: "Malformed token" };
  }

  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = signSegment(unsignedToken);
  if (!safeCompare(signature, expectedSignature)) {
    return { ok: false, error: "Invalid signature" };
  }

  let payload: PromptArtifactTokenPayload;
  try {
    const decodedPayload = fromBase64Url(encodedPayload);
    payload = JSON.parse(decodedPayload) as PromptArtifactTokenPayload;
  } catch {
    return { ok: false, error: "Invalid payload" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    return { ok: false, error: "Token expired" };
  }

  if (payload.sub !== input.userId) {
    return { ok: false, error: "Token subject mismatch" };
  }

  if (payload.ph !== sha256Base64Url(input.prompt)) {
    return { ok: false, error: "Prompt hash mismatch" };
  }

  if (payload.prh !== sha256Base64Url(input.productRequirements)) {
    return { ok: false, error: "Product requirements hash mismatch" };
  }

  if (payload.rrh !== sha256Base64Url(input.researchReport)) {
    return { ok: false, error: "Research report hash mismatch" };
  }

  return { ok: true, payload };
}
