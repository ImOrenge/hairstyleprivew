import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildLeadWebhook,
  parseBrandPartnershipFields,
  PARTNERSHIP_BUDGETS,
  PARTNERSHIP_TIMELINES,
} from "./b2b-lead-contract.ts";

const migrationName = "20260826094735_brand_partnership_leads.sql";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

const validBrandFields = {
  partnershipType: "advertising",
  companyWebsite: "https://brand.example",
  campaignGoal: "신제품 인지도와 체험 전환을 높이고 싶습니다.",
  targetAudience: "새 헤어스타일을 탐색하는 20–30대",
  referenceUrl: "https://brand.example/campaign",
  desiredTimeline: PARTNERSHIP_TIMELINES[1],
  budgetRange: PARTNERSHIP_BUDGETS[1],
  privacyConsent: true,
};

test("brand partnership validation accepts the fixed contract", () => {
  const result = parseBrandPartnershipFields(validBrandFields);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.partnershipType, "advertising");
    assert.equal(result.value.companyWebsite, "https://brand.example");
  }
});

test("brand partnership validation rejects missing, enum, URL, and consent failures", () => {
  assert.equal(parseBrandPartnershipFields({ ...validBrandFields, campaignGoal: "" }).ok, false);
  assert.equal(parseBrandPartnershipFields({ ...validBrandFields, partnershipType: "api_partner" }).ok, false);
  assert.equal(parseBrandPartnershipFields({ ...validBrandFields, desiredTimeline: "tomorrow" }).ok, false);
  assert.equal(parseBrandPartnershipFields({ ...validBrandFields, budgetRange: "free" }).ok, false);
  assert.equal(parseBrandPartnershipFields({ ...validBrandFields, companyWebsite: "javascript:alert(1)" }).ok, false);
  assert.equal(parseBrandPartnershipFields({ ...validBrandFields, referenceUrl: "ftp://files.example" }).ok, false);
  assert.equal(parseBrandPartnershipFields({ ...validBrandFields, privacyConsent: false }).ok, false);
});

test("legacy salon and brand webhooks keep distinct event contracts", () => {
  const common = {
    id: "lead-1",
    company_name: "Hair Brand",
    contact_name: "담당자",
    email: "brand@example.test",
    phone: null,
    message: "문의 내용입니다.",
    source: "public_form",
    created_at: "2026-08-26T00:00:00.000Z",
  };
  const salon = buildLeadWebhook({ ...common, lead_kind: "salon_adoption" }, "2026-08-26T00:01:00.000Z");
  const brand = buildLeadWebhook(
    {
      ...common,
      lead_kind: "brand_partnership",
      partnership_type: "joint_campaign",
      campaign_goal: "공동 캠페인",
    },
    "2026-08-26T00:01:00.000Z",
  );

  assert.equal(salon.event, "b2b.lead.created");
  assert.equal(salon.payload.event, "b2b.lead.created");
  assert.equal(brand.event, "partnership.lead.created");
  assert.equal(brand.payload.event, "partnership.lead.created");
});

test("lead API keeps legacy default, Turnstile, insert failure, and brand persistence contracts", () => {
  const route = read("../app/api/b2b/lead/route.ts");

  assert.match(route, /const leadKind: LeadKind = isLeadKind\(leadKindRaw\) \? leadKindRaw : "salon_adoption"/);
  assert.match(route, /const turnstile = await verifyTurnstile\(turnstileToken, request\)/);
  assert.match(route, /lead_kind: leadKind/);
  assert.match(route, /privacy_consent_at: privacyConsentAt/);
  assert.match(route, /문의 접수에 실패했습니다\. 잠시 후 다시 시도해 주세요\./);
  assert.doesNotMatch(route, /error\?\.message \|\| "Lead insert failed"/);
  assert.doesNotMatch(route, /turnstile: turnstile\.result/);
});

test("migration is mirrored, additive, private, batched, and scheduled", () => {
  const rootMigration = read(`../../supabase/migrations/${migrationName}`);
  const appMigration = read(`../supabase/migrations/${migrationName}`);
  const smoke = read("../supabase/tests/brand_partnership_lead_retention_smoke.sql");

  assert.equal(appMigration, rootMigration);
  assert.match(rootMigration, /lead_kind text not null default 'salon_adoption'/);
  assert.match(rootMigration, /create or replace function private\.apply_brand_partnership_lead_retention/);
  assert.match(rootMigration, /security definer[\s\S]*set search_path = ''/);
  assert.match(rootMigration, /create or replace function public\.apply_brand_partnership_lead_retention[\s\S]*security invoker/);
  assert.match(rootMigration, /p_limit is null or p_limit not between 1 and 500/);
  assert.match(rootMigration, /stage <> 'contracted'/);
  assert.match(rootMigration, /for update skip locked/);
  assert.match(rootMigration, /'43 3 \* \* \*'/);
  assert.match(rootMigration, /grant execute on function public\.apply_brand_partnership_lead_retention[\s\S]*to service_role/);
  assert.match(smoke, /active, contracted, or salon lead was deleted/);
});

test("public page, privacy disclosure, and crawler contracts are connected", () => {
  const page = read("../app/partnerships/page.tsx");
  const form = read("../components/partnerships/PartnershipLeadForm.tsx");
  const privacy = read("../app/privacy-policy/page.tsx");
  const sitemap = read("../app/sitemap.ts");
  const robots = read("../app/robots.ts");

  assert.match(page, /alternates:[\s\S]*canonical: "\/partnerships"/);
  assert.match(page, /제휴 제안 보내기/);
  assert.match(form, /leadKind: "brand_partnership"/);
  assert.match(form, /role="alert"/);
  assert.match(form, /role="status"/);
  assert.match(form, /privacyConsent/);
  assert.match(privacy, /미계약 광고·제휴 문의는 접수일로부터 1년/);
  assert.match(sitemap, /\/partnerships/);
  assert.match(robots, /\/partnerships/);
});

test("admin CRM scopes filters, totals, stage counts, and brand detail fields", () => {
  const adminApi = read("../app/api/admin/b2b/leads/route.ts");
  const adminPage = read("../app/admin/b2b/page.tsx");

  assert.match(adminApi, /url\.searchParams\.get\("leadKind"\)/);
  assert.match(adminApi, /query = query\.eq\("lead_kind", leadKind\)/);
  assert.match(adminApi, /Promise\.all\(LEAD_STAGES\.map/);
  assert.match(adminApi, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(adminApi, /campaign_goal\.ilike/);
  assert.match(adminPage, /all: "전체"/);
  assert.match(adminPage, /salon_adoption: "살롱 도입"/);
  assert.match(adminPage, /brand_partnership: "브랜드 제휴"/);
  assert.match(adminPage, /개인정보 동의 \/ 미계약 보유 만료/);
});
