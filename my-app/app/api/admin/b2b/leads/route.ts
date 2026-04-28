import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../lib/admin-auth";
import { trimText } from "../../../../../lib/onboarding";

const LEAD_STAGES = ["new", "qualified", "negotiation", "contracted", "dropped"] as const;
const LEAD_SOURCES = ["public_form", "admin_manual"] as const;

type LeadStage = (typeof LEAD_STAGES)[number];
type LeadSource = (typeof LEAD_SOURCES)[number];

interface LeadRow {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  message: string;
  stage: LeadStage;
  source: LeadSource;
  owner_admin_user_id: string | null;
  owner_note: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

function escapeSearchValue(value: string) {
  return value.replace(/[%,()]/g, "");
}

function parseLimit(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 80;
  }

  return Math.min(250, Math.max(20, Math.floor(parsed)));
}

function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === "string" && LEAD_STAGES.includes(value as LeadStage);
}

function isLeadSource(value: unknown): value is LeadSource {
  return typeof value === "string" && LEAD_SOURCES.includes(value as LeadSource);
}

export async function GET(request: Request) {
  const context = await getAdminApiContext();
  if (!context.ok) {
    return context.response;
  }

  const url = new URL(request.url);
  const q = escapeSearchValue(trimText(url.searchParams.get("q"), 100));
  const stage = url.searchParams.get("stage");
  const source = url.searchParams.get("source");
  const limit = parseLimit(url.searchParams.get("limit"));

  let query = context.supabase
    .from("b2b_leads")
    .select(
      "id,company_name,contact_name,email,phone,message,stage,source,owner_admin_user_id,owner_note,last_contacted_at,created_at,updated_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (q) {
    query = query.or(
      `company_name.ilike.%${q}%,contact_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,message.ilike.%${q}%`,
    );
  }

  if (isLeadStage(stage)) {
    query = query.eq("stage", stage);
  }

  if (isLeadSource(source)) {
    query = query.eq("source", source);
  }

  const { data, error, count } = await query.returns<LeadRow[]>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: stageRows, error: stageError } = await context.supabase
    .from("b2b_leads")
    .select("stage")
    .returns<Array<{ stage: LeadStage }>>();

  if (stageError) {
    return NextResponse.json({ error: stageError.message }, { status: 500 });
  }

  const stageSummary = LEAD_STAGES.map((key) => ({
    stage: key,
    count: (stageRows || []).filter((item) => item.stage === key).length,
  }));

  return NextResponse.json(
    {
      leads: data || [],
      total: count ?? (data || []).length,
      stageSummary,
      limit,
    },
    { status: 200 },
  );
}
