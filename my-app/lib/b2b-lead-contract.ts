import { trimText } from "./onboarding.ts";

export const LEAD_KINDS = ["salon_adoption", "brand_partnership"] as const;
export const PARTNERSHIP_TYPES = ["advertising", "branded_content", "joint_campaign", "other"] as const;
export const PARTNERSHIP_TIMELINES = ["1개월 이내", "1–3개월", "3–6개월", "6개월 이후", "협의 중"] as const;
export const PARTNERSHIP_BUDGETS = [
  "300만원 미만",
  "300만–1천만원",
  "1천만–3천만원",
  "3천만원 이상",
  "협의 중",
] as const;

export type LeadKind = (typeof LEAD_KINDS)[number];
export type PartnershipType = (typeof PARTNERSHIP_TYPES)[number];
export type PartnershipTimeline = (typeof PARTNERSHIP_TIMELINES)[number];
export type PartnershipBudget = (typeof PARTNERSHIP_BUDGETS)[number];

export interface BrandPartnershipFields {
  partnershipType: PartnershipType;
  companyWebsite: string | null;
  campaignGoal: string;
  targetAudience: string | null;
  referenceUrl: string | null;
  desiredTimeline: PartnershipTimeline;
  budgetRange: PartnershipBudget;
  privacyConsent: true;
}

export interface LeadWebhookRow {
  id: string;
  lead_kind: LeadKind;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  message: string;
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
  partnership_type?: PartnershipType | null;
  company_website?: string | null;
  campaign_goal?: string | null;
  target_audience?: string | null;
  reference_url?: string | null;
  privacy_consent_at?: string | null;
  privacy_retention_expires_at?: string | null;
}

function isAllowed<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value as T[number]);
}

export function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function optionalHttpUrl(value: unknown) {
  const parsed = trimText(value, 500);
  if (!parsed) return { ok: true as const, value: null };
  if (!isHttpUrl(parsed)) return { ok: false as const };
  return { ok: true as const, value: parsed };
}

export function parseBrandPartnershipFields(body: Record<string, unknown>) {
  const partnershipType = trimText(body.partnershipType, 40);
  const campaignGoal = trimText(body.campaignGoal, 500);
  const desiredTimeline = trimText(body.desiredTimeline, 40);
  const budgetRange = trimText(body.budgetRange, 40);
  const companyWebsite = optionalHttpUrl(body.companyWebsite);
  const referenceUrl = optionalHttpUrl(body.referenceUrl);

  if (!isAllowed(PARTNERSHIP_TYPES, partnershipType)) {
    return { ok: false as const, error: "partnershipType is invalid" };
  }
  if (campaignGoal.length < 5) {
    return { ok: false as const, error: "campaignGoal must be at least 5 characters" };
  }
  if (!isAllowed(PARTNERSHIP_TIMELINES, desiredTimeline)) {
    return { ok: false as const, error: "desiredTimeline is invalid" };
  }
  if (!isAllowed(PARTNERSHIP_BUDGETS, budgetRange)) {
    return { ok: false as const, error: "budgetRange is invalid" };
  }
  if (!companyWebsite.ok || !referenceUrl.ok) {
    return { ok: false as const, error: "companyWebsite and referenceUrl must use HTTP(S)" };
  }
  if (body.privacyConsent !== true) {
    return { ok: false as const, error: "privacyConsent is required" };
  }

  return {
    ok: true as const,
    value: {
      partnershipType,
      companyWebsite: companyWebsite.value,
      campaignGoal,
      targetAudience: trimText(body.targetAudience, 500) || null,
      referenceUrl: referenceUrl.value,
      desiredTimeline,
      budgetRange,
      privacyConsent: true as const,
    },
  };
}

export function buildLeadWebhook(lead: LeadWebhookRow, submittedAt: string) {
  if (lead.lead_kind === "brand_partnership") {
    return {
      event: "partnership.lead.created" as const,
      payload: {
        event: "partnership.lead.created",
        leadId: lead.id,
        submittedAt,
        partnershipType: lead.partnership_type,
        company: {
          name: lead.company_name,
          website: lead.company_website,
        },
        contact: {
          name: lead.contact_name,
          email: lead.email,
          phone: lead.phone,
        },
        campaign: {
          goal: lead.campaign_goal,
          targetAudience: lead.target_audience,
          desiredTimeline: lead.desired_timeline,
          budgetRange: lead.budget_range,
          referenceUrl: lead.reference_url,
          message: lead.message,
        },
        privacy: {
          consentAt: lead.privacy_consent_at,
          retentionExpiresAt: lead.privacy_retention_expires_at,
        },
        source: {
          type: lead.source,
          page: lead.source_page,
          createdAt: lead.created_at,
        },
      },
    };
  }

  return {
    event: "b2b.lead.created" as const,
    payload: {
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
    },
  };
}
