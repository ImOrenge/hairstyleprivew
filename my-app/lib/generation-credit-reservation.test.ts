import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getGenerationRetryPath,
  normalizeGenerationRetryPath,
} from "./generation-retry-path.ts";
import { callSupabaseRpc } from "./supabase-rpc.ts";

const migrationName = "20260715160000_generation_credit_reservation_settlement.sql";

function read(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("generation credit reservation migration stays mirrored and service-role-only", () => {
  const rootMigration = read(`../../supabase/migrations/${migrationName}`);
  const appMigration = read(`../supabase/migrations/${migrationName}`);

  assert.equal(appMigration, rootMigration);
  assert.match(rootMigration, /create table public\.generation_credit_reservations/);
  assert.match(rootMigration, /state in \('reserved', 'committed', 'released'\)/);
  assert.match(rootMigration, /quote_policy_version text/);
  assert.match(rootMigration, /'quotePolicyVersion', reservation\.quote_policy_version/);
  assert.match(rootMigration, /from public\.users as users[\s\S]*for update/);
  assert.match(rootMigration, /QUOTE_CHANGED: current credit balance no longer matches quote/);
  assert.match(rootMigration, /subjectId'[\s\S]*p_draft_id::text/);
  assert.match(rootMigration, /payer_scope in \('customer', 'salon'\)/);
  assert.match(rootMigration, /force row level security/);
  assert.match(
    rootMigration,
    /revoke all on table public\.generation_credit_reservations from public, anon, authenticated/,
  );
  assert.match(
    rootMigration,
    /revoke all on function public\.consume_credits[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    rootMigration,
    /grant execute on function public\.consume_credits[\s\S]*to service_role/,
  );
  assert.match(
    rootMigration,
    /revoke all on function public\.ensure_user_profile\(text, text, text\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    rootMigration,
    /grant execute on function public\.ensure_user_profile\(text, text, text\)[\s\S]*to service_role/,
  );
});

test("durable acceptance reserves credit before publishing Workflow intent", () => {
  const migration = read(`../../supabase/migrations/${migrationName}`);
  const generationInsert = migration.indexOf("insert into public.generations (");
  const ledgerInsert = migration.lastIndexOf("insert into public.credit_ledger (");
  const reservationInsert = migration.indexOf("insert into public.generation_credit_reservations (");
  const outboxInsert = migration.indexOf("insert into public.generation_workflow_outbox (");

  assert.ok(generationInsert >= 0);
  assert.ok(ledgerInsert > generationInsert);
  assert.ok(reservationInsert > ledgerInsert);
  assert.ok(outboxInsert > reservationInsert);
  assert.match(migration, /'recommendation_grid_usage'/);
  assert.match(migration, /p_credits_used <> 10/);
  assert.match(migration, /'creditReceipt', v_credit_receipt/);
  assert.match(migration, /'billingMode', 'reserved_v1'/);
  assert.match(migration, /\r?\n\s+0,\r?\n\s+'gemini'/, "accepted generation starts with zero committed credits");
});

test("authoritative generation state commits or fully restores the reservation", () => {
  const migration = read(`../../supabase/migrations/${migrationName}`);

  assert.match(migration, /create or replace function public\.settle_generation_credit_reservation/);
  assert.match(migration, /p_outcome not in \('commit', 'release'\)/);
  assert.match(migration, /state = 'committed'/);
  assert.match(migration, /entry_type,[\s\S]*'refund'/);
  assert.match(migration, /recommendation_grid_full_failure_refund/);
  assert.match(migration, /idx_credit_ledger_unique_recommendation_grid_release/);
  assert.match(migration, /after update of status, options on public\.generations/);
  assert.match(migration, /generatedImagePath/);
  assert.match(migration, /settlement_reason is null or length\(settlement_reason\) between 1 and 256/);
  assert.match(migration, /v_settlement_reason := left\([\s\S]*256/);
});

test("runtime uses the reservation snapshot and blocks refunded retries", () => {
  const acceptRoute = read("../app/api/generations/accept/route.ts");
  const salonAcceptRoute = read("../app/api/salon/customers/[id]/workspace/recommendations/route.ts");
  const webGenerationDetail = read("../app/generate/[id]/page.tsx");
  const nativeGenerationDetail = read("../../apps/hairfit-app/app/generate/[id].tsx");
  const prepareRoute = read("../app/api/generations/prepare/route.ts");
  const runRoute = read("../app/api/generations/run/route.ts");
  const notificationOutbox = read("generation-notification-outbox.ts");
  const receiptReader = read("generation-credit-receipt.ts");
  const resend = read("resend.ts");

  assert.match(acceptRoute, /generation-acceptance-v2-credit-reservation/);
  assert.match(acceptRoute, /creditReceipt/);
  assert.match(acceptRoute, /creditsRequired = HAIRSTYLE_GENERATION_CREDITS/);
  assert.doesNotMatch(acceptRoute, /getCreditsPerStyle/);
  assert.match(salonAcceptRoute, /creditsRequired = HAIRSTYLE_GENERATION_CREDITS/);
  assert.doesNotMatch(salonAcceptRoute, /getCreditsPerStyle/);
  assert.match(prepareRoute, /readReservedGenerationCredits\(claim\.options\)/);
  assert.match(runRoute, /generationCreditReceipt\?\.reservedCredits/);
  assert.match(runRoute, /allowRpcUnavailable: true/);
  assert.match(runRoute, /if \(!generationCreditReceipt && !recommendationSet\.creditChargedAt\)/);
  assert.match(runRoute, /GENERATION_CREDIT_REFUNDED/);
  assert.match(notificationOutbox, /Generation credit settlement is still pending/);
  assert.match(notificationOutbox, /creditReceipt/);
  assert.doesNotMatch(notificationOutbox, /allowRpcUnavailable/);
  assert.match(receiptReader, /generationId\.trim\(\)\.toLowerCase\(\)/);
  assert.match(webGenerationDetail, /새 사진으로 다시 생성/);
  assert.match(nativeGenerationDetail, /새 사진으로 다시 생성/);
  assert.match(nativeGenerationDetail, /Linking\.openURL/);
  assert.match(nativeGenerationDetail, /retryPath === "\/generate"/);
  assert.match(resend, /allFailed \? newGenerationUrl : input\.resultUrl/);
});

test("salon generation binds a server quote to the salon payer and requires explicit reconfirmation", () => {
  const salonAcceptRoute = read("../app/api/salon/customers/[id]/workspace/recommendations/route.ts");
  const salonWorkspace = read("../components/salon/SalonWorkspaceWizard.tsx");
  const salonController = read("../components/salon/useSalonGenerationController.ts");
  const salonAdapter = read("../components/salon/salonGenerationAdapter.ts");

  assert.match(salonAcceptRoute, /quoteId\?: unknown/);
  assert.match(salonAcceptRoute, /createPaidActionQuoteForUser/);
  assert.match(salonAcceptRoute, /billingScope: "salon"/);
  assert.match(salonAcceptRoute, /const isAcceptanceReplay/);
  assert.match(salonAcceptRoute, /if \(!isAcceptanceReplay\)/);
  assert.match(salonAcceptRoute, /validatePaidActionQuoteForExecution/);
  assert.match(salonAcceptRoute, /payerScope: "salon"/);
  assert.match(salonAcceptRoute, /creditQuote:/);
  assert.match(salonAcceptRoute, /quoteFingerprint: createHash\("sha256"\)/);
  assert.match(salonAcceptRoute, /code: "QUOTE_CHANGED"[\s\S]*quote: currentQuote/);
  assert.match(salonAcceptRoute, /code: "INSUFFICIENT_CREDITS"[\s\S]*quote: currentQuote/);

  assert.match(salonWorkspace, /PaidActionQuoteCard/);
  assert.match(salonController, /usePaidActionQuoteExpired/);
  assert.match(salonAdapter, /billingScope: "salon"/);
  assert.match(salonController, /quoteId: generationQuote\?\.quoteId/);
  assert.match(salonController, /data\.code === "QUOTE_CHANGED"/);
  assert.match(salonController, /갱신된 비용과 잔액을 확인한 뒤 다시 접수해 주세요/);
  assert.match(salonWorkspace, /disabled=[\s\S]*!canSubmitGeneration/);
});

test("reusable database smoke covers customer, stale-balance rollback, salon payer, and refund replay", () => {
  const smoke = read("../supabase/tests/paid_action_quote_smoke.sql");

  assert.match(smoke, /paid_quote_customer/);
  assert.match(smoke, /paid_quote_stale/);
  assert.match(smoke, /paid_quote_salon/);
  assert.match(smoke, /quotePolicyVersion/);
  assert.match(smoke, /stale quote left a generation row/);
  assert.match(smoke, /refund replay created % refund ledger rows/);
  assert.match(smoke, /paid_action_quote_db_smoke_ok/);
  assert.match(smoke, /rollback;/);
});

test("generation retry paths preserve salon context without allowing arbitrary redirects", () => {
  const customerId = "8C4C76B5-D91D-4D8A-BB0D-1A720E9D9882";
  assert.equal(
    getGenerationRetryPath({
      salonContext: { mode: "salon-crm-workspace", customerId },
    }),
    "/salon/customers/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882/workspace",
  );
  assert.equal(getGenerationRetryPath({ salonContext: { customerId } }), "/generate");
  assert.equal(normalizeGenerationRetryPath("https://evil.example/"), "/generate");
  assert.equal(
    normalizeGenerationRetryPath(
      "/salon/customers/8C4C76B5-D91D-4D8A-BB0D-1A720E9D9882/workspace",
    ),
    "/salon/customers/8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882/workspace",
  );
});

test("generation RPC calls preserve the Supabase client receiver", async () => {
  const client = {
    marker: "supabase-client",
    async rpc(this: { marker: string }, name: string, params: Record<string, unknown>) {
      assert.equal(this.marker, "supabase-client");
      assert.equal(name, "read_generation_credit_receipt");
      assert.deepEqual(params, {
        p_generation_id: "8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882",
        p_user_id: "user_credit_rpc",
      });
      return { data: { state: "reserved" }, error: null };
    },
  };

  const result = await callSupabaseRpc(
    client,
    "read_generation_credit_receipt",
    {
      p_generation_id: "8c4c76b5-d91d-4d8a-bb0d-1a720e9d9882",
      p_user_id: "user_credit_rpc",
    },
  );

  assert.deepEqual(result, { data: { state: "reserved" }, error: null });
});
