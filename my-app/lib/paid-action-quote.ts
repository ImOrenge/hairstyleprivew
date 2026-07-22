import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizePaidActionQuote,
  type PaidAction,
  type PaidActionBillingScope,
  type PaidActionQuote,
  type PaidActionQuoteErrorCode,
} from "@hairfit/shared/billing/paid-action";
import {
  ADDITIONAL_AFTERCARE_PROGRAM_CREDITS,
  DEFAULT_PRODUCT_CREDIT_POLICY,
  HAIRSTYLE_GENERATION_CREDITS,
  OUTFIT_LOOKBOOK_CREDITS,
} from "@hairfit/shared/billing/policy-selectors";

const QUOTE_TOKEN_VERSION = "paq1";
const QUOTE_TTL_MS = 5 * 60 * 1000;
const MIN_SIGNING_SECRET_LENGTH = 32;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type QuoteSnapshot = Omit<PaidActionQuote, "quoteId">;

interface QuoteTokenPayload extends QuoteSnapshot {
  version: 1;
  userId: string;
}

export class PaidActionQuoteError extends Error {
  readonly code: PaidActionQuoteErrorCode;
  readonly status: number;
  readonly quote?: PaidActionQuote;

  constructor(input: {
    message: string;
    code: PaidActionQuoteErrorCode;
    status: number;
    quote?: PaidActionQuote;
  }) {
    super(input.message);
    this.name = "PaidActionQuoteError";
    this.code = input.code;
    this.status = input.status;
    this.quote = input.quote;
  }
}

export class PaidActionQuoteContextError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PaidActionQuoteContextError";
    this.status = status;
  }
}

function normalizeSubjectId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new PaidActionQuoteContextError("subjectId must be a valid UUID", 400);
  }
  return normalized;
}

function normalizeCreditBalance(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new PaidActionQuoteContextError("현재 크레딧 잔액을 확인하지 못했습니다.", 500);
  }
  return parsed;
}

function readSigningSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.PAID_ACTION_QUOTE_SECRET?.trim() || "";
  if (secret.length < MIN_SIGNING_SECRET_LENGTH) {
    throw new Error("PAID_ACTION_QUOTE_SECRET must contain at least 32 characters");
  }
  return secret;
}

export function arePaidActionQuotesRequired(env: NodeJS.ProcessEnv = process.env) {
  return env.PAID_ACTION_QUOTES_REQUIRED?.trim().toLowerCase() !== "false";
}

function signSegment(segment: string, secret: string) {
  return createHmac("sha256", secret).update(segment).digest("base64url");
}

function safeSignatureEquals(left: string, right: string) {
  try {
    const leftBuffer = Buffer.from(left, "base64url");
    const rightBuffer = Buffer.from(right, "base64url");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

function parseQuoteToken(quoteId: string, secret: string): QuoteTokenPayload {
  const segments = quoteId.split(".");
  if (segments.length !== 3 || segments[0] !== QUOTE_TOKEN_VERSION) {
    throw new PaidActionQuoteError({
      message: "견적 정보를 확인할 수 없습니다. 최신 견적을 다시 받아 주세요.",
      code: "QUOTE_INVALID",
      status: 400,
    });
  }

  const signedSegment = `${segments[0]}.${segments[1]}`;
  const expectedSignature = signSegment(signedSegment, secret);
  if (!safeSignatureEquals(segments[2] || "", expectedSignature)) {
    throw new PaidActionQuoteError({
      message: "견적 정보가 올바르지 않습니다. 최신 견적을 다시 받아 주세요.",
      code: "QUOTE_INVALID",
      status: 400,
    });
  }

  try {
    const raw = JSON.parse(Buffer.from(segments[1] || "", "base64url").toString("utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid payload");
    const payload = raw as Record<string, unknown>;
    const userId = typeof payload.userId === "string" ? payload.userId.trim() : "";
    if (payload.version !== 1 || !userId) throw new Error("invalid payload");
    const quote = normalizePaidActionQuote({ ...payload, quoteId });
    if (!quote) throw new Error("invalid quote");
    const { quoteId: _quoteId, ...snapshot } = quote;
    void _quoteId;
    return { ...snapshot, version: 1, userId };
  } catch {
    throw new PaidActionQuoteError({
      message: "견적 정보를 읽지 못했습니다. 최신 견적을 다시 받아 주세요.",
      code: "QUOTE_INVALID",
      status: 400,
    });
  }
}

export function issuePaidActionQuoteToken(
  input: QuoteSnapshot & { userId: string },
  env: NodeJS.ProcessEnv = process.env,
): PaidActionQuote {
  const secret = readSigningSecret(env);
  const payload: QuoteTokenPayload = {
    version: 1,
    userId: input.userId,
    action: input.action,
    subjectId: input.subjectId,
    billingScope: input.billingScope,
    costCredits: input.costCredits,
    currentBalance: input.currentBalance,
    balanceAfter: input.balanceAfter,
    shortfallCredits: input.shortfallCredits,
    isFree: input.isFree,
    freeReason: input.freeReason,
    isAllowed: input.isAllowed,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    policyVersion: input.policyVersion,
    lockConsequence: input.lockConsequence,
    failurePolicy: input.failurePolicy,
  };
  const payloadSegment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signedSegment = `${QUOTE_TOKEN_VERSION}.${payloadSegment}`;
  const quoteId = `${signedSegment}.${signSegment(signedSegment, secret)}`;
  const quote = normalizePaidActionQuote({ ...payload, quoteId });
  if (!quote) throw new Error("Paid action quote snapshot is invalid");
  return quote;
}

export function verifyPaidActionQuoteToken(
  quoteId: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const secret = readSigningSecret(env);
  const payload = parseQuoteToken(quoteId, secret);
  const quote = normalizePaidActionQuote({ ...payload, quoteId });
  if (!quote) {
    throw new PaidActionQuoteError({
      message: "견적 정보가 올바르지 않습니다. 최신 견적을 다시 받아 주세요.",
      code: "QUOTE_INVALID",
      status: 400,
    });
  }
  return { quote, userId: payload.userId };
}

export function validatePaidActionQuoteForExecution(input: {
  quoteId: string;
  userId: string;
  currentQuote: PaidActionQuote;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}) {
  const verified = verifyPaidActionQuoteToken(input.quoteId, input.env);
  const quote = verified.quote;
  const now = input.now ?? new Date();
  if (Date.parse(quote.expiresAt) <= now.getTime()) {
    throw new PaidActionQuoteError({
      message: "견적 유효 시간이 지나 최신 잔액과 비용을 다시 확인해 주세요.",
      code: "QUOTE_EXPIRED",
      status: 409,
      quote: input.currentQuote,
    });
  }

  const current = input.currentQuote;
  const contextMatches =
    verified.userId === input.userId &&
    quote.action === current.action &&
    quote.subjectId === current.subjectId &&
    quote.billingScope === current.billingScope;
  if (!contextMatches) {
    throw new PaidActionQuoteError({
      message: "견적 대상이 현재 작업과 일치하지 않습니다. 최신 견적을 확인해 주세요.",
      code: "QUOTE_INVALID",
      status: 400,
    });
  }

  const policyMatches =
    quote.policyVersion === current.policyVersion &&
    quote.costCredits === current.costCredits &&
    quote.currentBalance === current.currentBalance &&
    quote.balanceAfter === current.balanceAfter &&
    quote.shortfallCredits === current.shortfallCredits &&
    quote.isAllowed === current.isAllowed &&
    quote.isFree === current.isFree &&
    quote.freeReason === current.freeReason &&
    quote.lockConsequence === current.lockConsequence &&
    quote.failurePolicy === current.failurePolicy;
  if (!policyMatches) {
    throw new PaidActionQuoteError({
      message: "잔액, 비용 또는 이용 정책이 변경되었습니다. 최신 견적을 확인한 뒤 다시 실행해 주세요.",
      code: "QUOTE_CHANGED",
      status: 409,
      quote: current,
    });
  }

  if (!current.isAllowed) {
    throw new PaidActionQuoteError({
      message: `크레딧이 ${current.shortfallCredits} 부족합니다. 충전 후 최신 견적을 다시 확인해 주세요.`,
      code: "INSUFFICIENT_CREDITS",
      status: 409,
      quote: current,
    });
  }

  return quote;
}

export function createPaidActionExecutionQuoteSnapshot(quote: PaidActionQuote) {
  return {
    action: quote.action,
    subjectId: quote.subjectId,
    billingScope: quote.billingScope,
    policyVersion: quote.policyVersion,
    costCredits: quote.costCredits,
    currentBalance: quote.currentBalance,
    balanceAfter: quote.balanceAfter,
    isAllowed: quote.isAllowed,
    expiresAt: quote.expiresAt,
    quoteFingerprint: createHash("sha256").update(quote.quoteId).digest("hex"),
  };
}

async function loadBalance(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("credits")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new PaidActionQuoteContextError(error.message, 500);
  if (!data) throw new PaidActionQuoteContextError("사용자 크레딧 계정을 찾을 수 없습니다.", 404);
  return normalizeCreditBalance(data.credits);
}

async function resolveHairGenerationCost(
  supabase: SupabaseClient,
  userId: string,
  subjectId: string,
) {
  const { data, error } = await supabase
    .from("generation_upload_drafts")
    .select("id,user_id,state,expires_at")
    .eq("id", subjectId)
    .maybeSingle();
  if (error) throw new PaidActionQuoteContextError(error.message, 500);
  if (!data || data.user_id !== userId) {
    throw new PaidActionQuoteContextError("생성 준비 영수증을 찾을 수 없습니다.", 404);
  }
  if (!new Set(["ready", "accepted"]).has(String(data.state))) {
    throw new PaidActionQuoteContextError("이 사진 업로드 영수증으로는 견적을 만들 수 없습니다.", 409);
  }
  if (data.state === "ready" && Date.parse(String(data.expires_at || "")) <= Date.now()) {
    throw new PaidActionQuoteContextError("사진 업로드 영수증이 만료되었습니다. 사진을 다시 업로드해 주세요.", 410);
  }
  if (data.state === "accepted") {
    return {
      costCredits: 0,
      freeReason: "already_accepted",
      lockConsequence: "이미 접수된 작업은 페이지나 앱을 닫아도 계속 진행됩니다.",
      failurePolicy: "기존 접수 영수증을 다시 확인하는 동작에는 추가 예약이나 차감이 없습니다.",
    };
  }
  return {
    costCredits: HAIRSTYLE_GENERATION_CREDITS,
    freeReason: null,
    lockConsequence: "접수가 완료되면 페이지나 앱을 닫아도 생성 작업이 계속됩니다.",
    failurePolicy: "결과가 하나 이상 완성되면 차감이 확정되고, 모두 실패하면 전액 자동 복구됩니다.",
  };
}

async function resolveOutfitGenerationCost(
  supabase: SupabaseClient,
  userId: string,
  subjectId: string,
) {
  const { data, error } = await supabase
    .from("styling_sessions")
    .select("id,user_id,status,credits_used")
    .eq("id", subjectId)
    .maybeSingle();
  if (error) throw new PaidActionQuoteContextError(error.message, 500);
  if (!data || data.user_id !== userId) {
    throw new PaidActionQuoteContextError("Styler 추천 세션을 찾을 수 없습니다.", 404);
  }
  const { data: latestAttempt, error: attemptError } = await supabase
    .from("styling_credit_attempts")
    .select("state")
    .eq("styling_session_id", subjectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const missingAttemptTable = attemptError?.code === "42P01" ||
    attemptError?.message?.includes("styling_credit_attempts");
  if (attemptError && !missingAttemptTable) {
    throw new PaidActionQuoteContextError(attemptError.message, 500);
  }

  const reservedForRetry = latestAttempt?.state === "reserved";
  const alreadyCharged = latestAttempt?.state === "committed" ||
    (data.status === "completed" && Number(data.credits_used || 0) > 0);
  return {
    costCredits: reservedForRetry || alreadyCharged ? 0 : OUTFIT_LOOKBOOK_CREDITS,
    freeReason: reservedForRetry
      ? "credit_already_reserved"
      : alreadyCharged
        ? "already_completed"
        : null,
    lockConsequence: null,
    failurePolicy: reservedForRetry
      ? "이미 예약한 크레딧으로 중단된 작업을 이어서 실행하며 추가 차감하지 않습니다."
      : alreadyCharged
        ? "완료된 룩북을 다시 여는 동작에는 추가 차감이 없습니다."
        : "성공하면 20크레딧 차감이 확정되고, 실패하면 예약 금액이 자동 복구됩니다.",
  };
}

async function resolveAftercareCost(
  supabase: SupabaseClient,
  userId: string,
  subjectId: string,
) {
  const { data: generation, error: generationError } = await supabase
    .from("generations")
    .select("id,user_id")
    .eq("id", subjectId)
    .maybeSingle();
  if (generationError) throw new PaidActionQuoteContextError(generationError.message, 500);
  if (!generation || generation.user_id !== userId) {
    throw new PaidActionQuoteContextError("헤어 추천 결과를 찾을 수 없습니다.", 404);
  }

  const { data: existingRecord, error: recordError } = await supabase
    .from("user_hair_records")
    .select("id")
    .eq("user_id", userId)
    .eq("generation_id", subjectId)
    .maybeSingle();
  if (recordError) throw new PaidActionQuoteContextError(recordError.message, 500);
  if (existingRecord) {
    const [{ data: guide, error: guideError }, { data: contents, error: contentsError }, { data: ledger, error: ledgerError }] =
      await Promise.all([
        supabase
          .from("user_aftercare_guides")
          .select("id")
          .eq("user_id", userId)
          .eq("hair_record_id", existingRecord.id)
          .maybeSingle(),
        supabase
          .from("user_care_contents")
          .select("content_type")
          .eq("user_id", userId)
          .eq("hair_record_id", existingRecord.id),
        supabase
          .from("credit_ledger")
          .select("id")
          .eq("user_id", userId)
          .eq("generation_id", subjectId)
          .eq("entry_type", "usage")
          .eq("reason", "aftercare_program_usage")
          .limit(1)
          .maybeSingle(),
      ]);
    if (guideError) throw new PaidActionQuoteContextError(guideError.message, 500);
    if (contentsError) throw new PaidActionQuoteContextError(contentsError.message, 500);
    if (ledgerError) throw new PaidActionQuoteContextError(ledgerError.message, 500);

    const expectedTypes = new Set([
      "dry_guide",
      "day3_care",
      "week1_tip",
      "month1_revisit",
      "month1_trend",
      "month3_cta",
    ]);
    const completedProgram = Boolean(
      guide && (contents || []).length === expectedTypes.size &&
      new Set((contents || []).map((row) => String(row.content_type))).size === expectedTypes.size &&
      (contents || []).every((row) => expectedTypes.has(String(row.content_type))),
    );
    if (completedProgram || ledger) {
      return {
        costCredits: 0,
        freeReason: completedProgram ? "already_created" : "retry_after_charge",
        lockConsequence: "확정된 헤어스타일과 시술일은 기존 에프터케어 기록에 유지됩니다.",
        failurePolicy: completedProgram
          ? "이미 만든 에프터케어 기록을 다시 여는 동작에는 추가 차감이 없습니다."
          : "기존 결제 영수증으로 미완료 기록을 복구하며 추가 차감하지 않습니다.",
      };
    }
  }

  const { data: freeClaim, error: freeClaimError } = await supabase
    .from("aftercare_free_claims")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  const missingClaimTable = freeClaimError?.code === "42P01" ||
    freeClaimError?.message?.includes("aftercare_free_claims");
  if (freeClaimError && !missingClaimTable) {
    throw new PaidActionQuoteContextError(freeClaimError.message, 500);
  }

  let hasUsedFreeProgram = Boolean(freeClaim);
  if (missingClaimTable) {
    const { data: previousGuide, error: guideError } = await supabase
      .from("user_aftercare_guides")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (guideError) throw new PaidActionQuoteContextError(guideError.message, 500);
    hasUsedFreeProgram = Boolean(previousGuide);
  }
  const firstProgram = !hasUsedFreeProgram;
  return {
    costCredits: firstProgram ? 0 : ADDITIONAL_AFTERCARE_PROGRAM_CREDITS,
    freeReason: firstProgram ? "first_aftercare_program" : null,
    lockConsequence: "저장 후 선택한 헤어스타일과 시술일을 기준으로 케어 일정이 만들어집니다.",
    failurePolicy: "저장 또는 일정 생성이 완료되지 않으면 유료 크레딧을 확정하지 않습니다.",
  };
}

export async function createPaidActionQuoteForUser(input: {
  supabase: SupabaseClient;
  userId: string;
  action: PaidAction;
  subjectId: string;
  billingScope: PaidActionBillingScope;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}) {
  const subjectId = normalizeSubjectId(input.subjectId);
  if (input.billingScope === "salon" && input.action !== "hair_generation") {
    throw new PaidActionQuoteContextError("이 작업은 살롱 계정 결제 범위를 지원하지 않습니다.", 400);
  }

  const [currentBalance, policy] = await Promise.all([
    loadBalance(input.supabase, input.userId),
    input.action === "hair_generation"
      ? resolveHairGenerationCost(input.supabase, input.userId, subjectId)
      : input.action === "outfit_generation"
        ? resolveOutfitGenerationCost(input.supabase, input.userId, subjectId)
        : resolveAftercareCost(input.supabase, input.userId, subjectId),
  ]);
  const now = input.now ?? new Date();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_MS).toISOString();
  const balanceAfter = currentBalance - policy.costCredits;
  const shortfallCredits = Math.max(0, -balanceAfter);
  const isFree = policy.costCredits === 0;

  return issuePaidActionQuoteToken(
    {
      userId: input.userId,
      action: input.action,
      subjectId,
      billingScope: input.billingScope,
      costCredits: policy.costCredits,
      currentBalance,
      balanceAfter,
      shortfallCredits,
      isFree,
      freeReason: policy.freeReason,
      isAllowed: shortfallCredits === 0,
      issuedAt,
      expiresAt,
      policyVersion: DEFAULT_PRODUCT_CREDIT_POLICY.version,
      lockConsequence: policy.lockConsequence,
      failurePolicy: policy.failurePolicy,
    },
    input.env,
  );
}
