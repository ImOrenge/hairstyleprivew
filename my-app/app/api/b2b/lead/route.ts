import { NextResponse } from "next/server";
import {
  buildLeadWebhook,
  LEAD_KINDS,
  parseBrandPartnershipFields,
  type LeadKind,
  type LeadWebhookRow,
} from "../../../../lib/b2b-lead-contract";
import { trimText } from "../../../../lib/onboarding";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";

type PlanInterest = "salon" | "pro" | "standard" | "basic" | "other";

interface LeadRequestBody {
  turnstileToken?: unknown;
  leadKind?: unknown;
  planInterest?: unknown;
  partnershipType?: unknown;
  companyName?: unknown;
  companyWebsite?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  region?: unknown;
  shopCount?: unknown;
  seatCount?: unknown;
  monthlyClients?: unknown;
  currentTools?: unknown;
  campaignGoal?: unknown;
  targetAudience?: unknown;
  desiredTimeline?: unknown;
  budgetRange?: unknown;
  referenceUrl?: unknown;
  privacyConsent?: unknown;
  message?: unknown;
  sourcePage?: unknown;
}

interface TurnstileResult {
  success?: boolean;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
  action?: string;
  cdata?: string;
}

interface LeadRow extends LeadWebhookRow {
  stage: string;
}

const PLAN_INTERESTS = ["salon", "pro", "standard", "basic", "other"] as const;
const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPlanInterest(value: string): value is PlanInterest {
  return PLAN_INTERESTS.includes(value as PlanInterest);
}

function isLeadKind(value: string): value is LeadKind {
  return LEAD_KINDS.includes(value as LeadKind);
}

function trimOptional(value: unknown, maxLength: number) {
  const trimmed = trimText(value, maxLength);
  return trimmed || null;
}

function parseOptionalNumber(value: unknown, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(0, Math.floor(parsed)));
}

function getRequestIp(request: Request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

async function verifyTurnstile(token: string, request: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return { ok: false as const, status: 503, error: "Security verification is temporarily unavailable" };
  }

  if (!token || token.length > 2048) {
    return { ok: false as const, status: 400, error: "Cloudflare verification token is invalid" };
  }

  try {
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: getRequestIp(request),
        idempotency_key: crypto.randomUUID(),
      }),
    });

    const result = (await response.json().catch(() => ({}))) as TurnstileResult;
    if (!response.ok || !result.success) {
      return {
        ok: false as const,
        status: 403,
        error: "Cloudflare verification failed. Please try again.",
        result,
      };
    }

    return { ok: true as const, result };
  } catch {
    return {
      ok: false as const,
      status: 503,
      error: "Cloudflare verification is temporarily unavailable",
    };
  }
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function signWebhookPayload(payload: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `sha256=${bytesToHex(signature)}`;
}

async function deliverLeadWebhook(lead: LeadRow) {
  const webhookUrl = process.env.B2B_LEAD_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return { delivered: false, error: null };
  }

  const submittedAt = new Date().toISOString();
  const webhook = buildLeadWebhook(lead, submittedAt);

  const rawPayload = JSON.stringify(webhook.payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-hairfit-event": webhook.event,
    "x-hairfit-timestamp": submittedAt,
  };

  const webhookSecret = process.env.B2B_LEAD_WEBHOOK_SECRET?.trim();
  if (webhookSecret) {
    headers["x-hairfit-signature"] = await signWebhookPayload(rawPayload, webhookSecret);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: rawPayload,
      signal: controller.signal,
    });
    if (!response.ok) {
      return { delivered: false, error: `Webhook HTTP ${response.status}` };
    }
    return { delivered: true, error: null };
  } catch (error) {
    return { delivered: false, error: error instanceof Error ? error.message : "Webhook delivery failed" };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as LeadRequestBody;
  const turnstileToken = trimText(body.turnstileToken, 2048);
  const turnstile = await verifyTurnstile(turnstileToken, request);
  if (!turnstile.ok) {
    return NextResponse.json(
      { error: turnstile.error },
      { status: turnstile.status },
    );
  }

  const companyName = trimText(body.companyName, 120);
  const contactName = trimText(body.contactName, 80);
  const email = trimText(body.email, 160).toLowerCase();
  const phone = trimOptional(body.phone, 40);
  const message = trimText(body.message, 2000);
  const leadKindRaw = trimText(body.leadKind, 40);
  if (leadKindRaw && !isLeadKind(leadKindRaw)) {
    return NextResponse.json({ error: "leadKind is invalid" }, { status: 400 });
  }
  const leadKind: LeadKind = isLeadKind(leadKindRaw) ? leadKindRaw : "salon_adoption";
  const planInterestRaw = trimText(body.planInterest, 40);
  const planInterest = isPlanInterest(planInterestRaw) ? planInterestRaw : "salon";

  if (!companyName || !contactName || !email || !message) {
    return NextResponse.json({ error: "companyName, contactName, email, message are required" }, { status: 400 });
  }

  if (!isEmail(email)) {
    return NextResponse.json({ error: "email format is invalid" }, { status: 400 });
  }

  if (message.length < 5) {
    return NextResponse.json({ error: "message must be at least 5 characters" }, { status: 400 });
  }

  const brandFields = leadKind === "brand_partnership"
    ? parseBrandPartnershipFields(body as Record<string, unknown>)
    : null;
  if (brandFields && !brandFields.ok) {
    return NextResponse.json({ error: brandFields.error }, { status: 400 });
  }

  const privacyConsentAt = brandFields?.ok ? new Date().toISOString() : null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("b2b_leads")
    .insert({
      company_name: companyName,
      contact_name: contactName,
      email,
      phone,
      message,
      stage: "new",
      source: "public_form",
      lead_kind: leadKind,
      plan_interest: planInterest,
      region: trimOptional(body.region, 80),
      shop_count: parseOptionalNumber(body.shopCount, 10000),
      seat_count: parseOptionalNumber(body.seatCount, 10000),
      monthly_clients: parseOptionalNumber(body.monthlyClients, 1_000_000),
      current_tools: trimOptional(body.currentTools, 500),
      desired_timeline: brandFields?.ok ? brandFields.value.desiredTimeline : trimOptional(body.desiredTimeline, 80),
      budget_range: brandFields?.ok ? brandFields.value.budgetRange : trimOptional(body.budgetRange, 80),
      source_page: trimOptional(body.sourcePage, 500),
      partnership_type: brandFields?.ok ? brandFields.value.partnershipType : null,
      company_website: brandFields?.ok ? brandFields.value.companyWebsite : null,
      campaign_goal: brandFields?.ok ? brandFields.value.campaignGoal : null,
      target_audience: brandFields?.ok ? brandFields.value.targetAudience : null,
      reference_url: brandFields?.ok ? brandFields.value.referenceUrl : null,
      privacy_consent_at: privacyConsentAt,
      turnstile_hostname: turnstile.result.hostname || null,
      turnstile_challenge_ts: turnstile.result.challenge_ts || null,
    })
    .select(
      "id,lead_kind,company_name,contact_name,email,phone,message,stage,source,created_at,plan_interest,region,shop_count,seat_count,monthly_clients,current_tools,desired_timeline,budget_range,source_page,partnership_type,company_website,campaign_goal,target_audience,reference_url,privacy_consent_at,privacy_retention_expires_at",
    )
    .maybeSingle<LeadRow>();

  if (error || !data) {
    console.error("[b2b/lead] insert failed", error);
    return NextResponse.json({ error: "문의 접수에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }

  const webhook = await deliverLeadWebhook(data);
  await supabase
    .from("b2b_leads")
    .update({
      webhook_delivered: webhook.delivered,
      webhook_error: webhook.error,
      webhook_delivered_at: webhook.delivered ? new Date().toISOString() : null,
    })
    .eq("id", data.id);

  return NextResponse.json(
    { lead: data, webhookDelivered: webhook.delivered },
    { status: 201 },
  );
}
