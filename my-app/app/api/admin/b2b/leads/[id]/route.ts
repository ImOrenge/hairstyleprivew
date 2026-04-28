import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../../lib/admin-auth";
import { trimText } from "../../../../../../lib/onboarding";

const LEAD_STAGES = ["new", "qualified", "negotiation", "contracted", "dropped"] as const;
type LeadStage = (typeof LEAD_STAGES)[number];

interface Params {
  params: Promise<{ id: string }>;
}

interface UpdateLeadBody {
  stage?: unknown;
  ownerNote?: unknown;
  ownerAdminUserId?: unknown;
  lastContactedAt?: unknown;
}

interface LeadRow {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  message: string;
  stage: LeadStage;
  source: "public_form" | "admin_manual";
  owner_admin_user_id: string | null;
  owner_note: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === "string" && LEAD_STAGES.includes(value as LeadStage);
}

function parseNullableIso(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export async function PATCH(request: Request, { params }: Params) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const resolvedParams = await params;
  const leadId = trimText(resolvedParams.id, 160);
  if (!leadId) {
    return NextResponse.json({ error: "Lead id is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as UpdateLeadBody;
  const updates: Record<string, unknown> = {};

  if (body.stage !== undefined) {
    if (!isLeadStage(body.stage)) {
      return NextResponse.json({ error: "stage is invalid" }, { status: 400 });
    }
    updates.stage = body.stage;
  }

  if (body.ownerNote !== undefined) {
    updates.owner_note = trimText(body.ownerNote, 2000) || null;
  }

  if (body.ownerAdminUserId !== undefined) {
    const ownerId = trimText(body.ownerAdminUserId, 160);
    updates.owner_admin_user_id = ownerId || null;
  }

  if (body.lastContactedAt !== undefined) {
    const iso = parseNullableIso(body.lastContactedAt);
    if (body.lastContactedAt && !iso) {
      return NextResponse.json({ error: "lastContactedAt is invalid" }, { status: 400 });
    }
    updates.last_contacted_at = iso;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("b2b_leads")
    .update(updates)
    .eq("id", leadId)
    .select(
      "id,company_name,contact_name,email,phone,message,stage,source,owner_admin_user_id,owner_note,last_contacted_at,created_at,updated_at",
    )
    .maybeSingle<LeadRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({ lead: data }, { status: 200 });
}
