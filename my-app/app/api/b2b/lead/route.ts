import { NextResponse } from "next/server";
import { trimText } from "../../../../lib/onboarding";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../../lib/supabase";

type PlanInterest = "salon" | "pro" | "standard" | "basic" | "other";

interface LeadRequestBody {
  turnstileToken?: unknown;
  planInterest?: unknown;
  companyName?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  region?: unknown;
  shopCount?: unknown;
  seatCount?: unknown;
  monthlyClients?: unknown;
  currentTools?: unknown;
  desiredTimeline?: unknown;
  budgetRange?: unknown;
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

interface LeadRow {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  message: string;
  stage: string;
  source: string;
  created_at: string;
  plan_interest?: string | null;
  region?: string | null;
  shop_count?: number | null;
  seat_count?: number | null;
  monthly_clients?: number | null;
  current_tools?: string | null;
  desired_timeline?: string | null;
  budget_range?: string | null;
  source_page?: string | null;
}

const PLAN_INTERESTS = ["salon", "pro", "standard", "basic", "other"] as const;
const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPlanInterest(value: string): value is PlanInterest {
  return PLAN_INTERESTS.includes(value as PlanInterest);
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
    return { ok: false as const, status: 503, error: "TURNSTILE_SECRET_KEY is not configured" };
  }

  if (!token || token.length > 2048) {
    return { ok: false as const, status: 400, error: "Cloudflare verification token is invalid" };
  }

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
  const payload = {
    event: "b2b.lead.created",
    leadId: lead.id,
    submittedAt,
    planInterest: lead.plan_interest || "salon",
    company: {
      name: lead.company_name,
      region: lead.region,
    },
    contact: {
      name: lead.contact_name,
      email: lead.email,
      phone: lead.phone,
    },
    businessProfile: {
      shopCount: lead.shop_count,
      seatCount: lead.seat_count,
      monthlyClients: lead.monthly_clients,
      currentTools: lead.current_tools,
    },
    requirements: {
      desiredTimeline: lead.desired_timeline,
      budgetRange: lead.budget_range,
      message: lead.message,
    },
    source: {
      type: lead.source,
      page: lead.source_page,
      createdAt: lead.created_at,
    },
  };

  const rawPayload = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-hairfit-event": "b2b.lead.created",
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
      { error: turnstile.error, turnstile: turnstile.result },
      { status: turnstile.status },
    );
  }

  const companyName = trimText(body.companyName, 120);
  const contactName = trimText(body.contactName, 80);
  const email = trimText(body.email, 160).toLowerCase();
  const phone = trimOptional(body.phone, 40);
  const message = trimText(body.message, 2000);
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
      plan_interest: planInterest,
      region: trimOptional(body.region, 80),
      shop_count: parseOptionalNumber(body.shopCount, 10000),
      seat_count: parseOptionalNumber(body.seatCount, 10000),
      monthly_clients: parseOptionalNumber(body.monthlyClients, 1_000_000),
      current_tools: trimOptional(body.currentTools, 500),
      desired_timeline: trimOptional(body.desiredTimeline, 80),
      budget_range: trimOptional(body.budgetRange, 80),
      source_page: trimOptional(body.sourcePage, 500),
      turnstile_hostname: turnstile.result.hostname || null,
      turnstile_challenge_ts: turnstile.result.challenge_ts || null,
    })
    .select(
      "id,company_name,contact_name,email,phone,message,stage,source,created_at,plan_interest,region,shop_count,seat_count,monthly_clients,current_tools,desired_timeline,budget_range,source_page",
    )
    .maybeSingle<LeadRow>();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Lead insert failed" }, { status: 500 });
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
