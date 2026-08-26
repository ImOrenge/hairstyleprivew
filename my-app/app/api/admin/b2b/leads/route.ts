import { NextResponse } from "next/server";
import { getAdminApiContext } from "../../../../../lib/admin-auth";
import { LEAD_KINDS, type LeadKind, type PartnershipType } from "../../../../../lib/b2b-lead-contract";
import { decodeListCursor, encodeListCursor } from "../../../../../lib/list-cursor";
import { trimText } from "../../../../../lib/onboarding";

const LEAD_STAGES = ["new", "qualified", "negotiation", "contracted", "dropped"] as const;
const LEAD_SOURCES = ["public_form", "admin_manual"] as const;

type LeadStage = (typeof LEAD_STAGES)[number];
type LeadSource = (typeof LEAD_SOURCES)[number];

interface LeadRow {
  id: string;
  lead_kind: LeadKind;
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
  plan_interest: string | null;
  region: string | null;
  shop_count: number | null;
  seat_count: number | null;
  monthly_clients: number | null;
  current_tools: string | null;
  desired_timeline: string | null;
  budget_range: string | null;
  source_page: string | null;
  webhook_delivered: boolean;
  webhook_error: string | null;
  partnership_type: PartnershipType | null;
  company_website: string | null;
  campaign_goal: string | null;
  target_audience: string | null;
  reference_url: string | null;
  privacy_consent_at: string | null;
  privacy_retention_expires_at: string | null;
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

function isLeadKind(value: unknown): value is LeadKind {
  return typeof value === "string" && LEAD_KINDS.includes(value as LeadKind);
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
  const leadKind = url.searchParams.get("leadKind");
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursorParam = url.searchParams.get("cursor");
  const cursor = decodeListCursor(cursorParam);
  if (cursorParam && !cursor) {
    return NextResponse.json({ error: "Invalid pagination cursor" }, { status: 400 });
  }
  if (leadKind && !isLeadKind(leadKind)) {
    return NextResponse.json({ error: "leadKind is invalid" }, { status: 400 });
  }

  let query = context.supabase
    .from("b2b_leads")
    .select(
      "id,lead_kind,company_name,contact_name,email,phone,message,stage,source,owner_admin_user_id,owner_note,last_contacted_at,created_at,updated_at,plan_interest,region,shop_count,seat_count,monthly_clients,current_tools,desired_timeline,budget_range,source_page,webhook_delivered,webhook_error,partnership_type,company_website,campaign_goal,target_audience,reference_url,privacy_consent_at,privacy_retention_expires_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.or(`created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`);
  }

  if (q) {
    query = query.or(
      `company_name.ilike.%${q}%,contact_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,message.ilike.%${q}%,region.ilike.%${q}%,current_tools.ilike.%${q}%,company_website.ilike.%${q}%,campaign_goal.ilike.%${q}%,target_audience.ilike.%${q}%,reference_url.ilike.%${q}%`,
    );
  }

  if (isLeadStage(stage)) {
    query = query.eq("stage", stage);
  }

  if (isLeadSource(source)) {
    query = query.eq("source", source);
  }

  if (isLeadKind(leadKind)) {
    query = query.eq("lead_kind", leadKind);
  }

  const { data, error, count } = await query.returns<LeadRow[]>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stageSummaryResults = await Promise.all(LEAD_STAGES.map(async (key) => {
    let stageQuery = context.supabase
      .from("b2b_leads")
      .select("id", { count: "exact", head: true })
      .eq("stage", key);

    if (q) {
      stageQuery = stageQuery.or(
        `company_name.ilike.%${q}%,contact_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,message.ilike.%${q}%,region.ilike.%${q}%,current_tools.ilike.%${q}%,company_website.ilike.%${q}%,campaign_goal.ilike.%${q}%,target_audience.ilike.%${q}%,reference_url.ilike.%${q}%`,
      );
    }
    if (isLeadSource(source)) {
      stageQuery = stageQuery.eq("source", source);
    }
    if (isLeadKind(leadKind)) {
      stageQuery = stageQuery.eq("lead_kind", leadKind);
    }

    const { count: stageCount, error: stageError } = await stageQuery;
    return { stage: key, count: stageCount || 0, error: stageError };
  }));

  const stageSummaryError = stageSummaryResults.find((item) => item.error)?.error;
  if (stageSummaryError) {
    return NextResponse.json({ error: stageSummaryError.message }, { status: 500 });
  }

  const stageSummary = stageSummaryResults.map(({ stage: key, count: stageCount }) => ({
    stage: key,
    count: stageCount,
  }));

  const rows = data || [];
  const hasMore = rows.length > limit;
  const leads = rows.slice(0, limit);
  const lastLead = leads.at(-1);

  return NextResponse.json(
    {
      leads,
      total: count ?? leads.length,
      stageSummary,
      limit,
      nextCursor:
        hasMore && lastLead
          ? encodeListCursor(lastLead.created_at, lastLead.id)
          : null,
    },
    { status: 200 },
  );
}
