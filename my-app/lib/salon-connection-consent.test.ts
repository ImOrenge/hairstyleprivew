import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const appRoot = resolve(process.cwd());
const repoRoot = resolve(appRoot, "..");

function readApp(path: string) {
  return readFileSync(resolve(appRoot, path), "utf8");
}

function readRepo(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("salon consent migration is mirrored and restricts writes to service-role RPCs", () => {
  const relativeMigration = "supabase/migrations/20260717042426_salon_connection_consent_revocation.sql";
  const appMigration = readApp(relativeMigration).trim();
  const rootMigration = readRepo(relativeMigration).trim();

  assert.equal(appMigration, rootMigration);
  assert.match(appMigration, /idx_salon_match_invites_one_active_per_owner/);
  assert.match(appMigration, /salon_connection_audit_events/);
  assert.match(appMigration, /revoke insert, update, delete on table public\.salon_match_requests from anon, authenticated/i);
  assert.match(appMigration, /grant execute on function public\.revoke_salon_connection[\s\S]*to service_role/i);
  assert.match(appMigration, /CURRENT_EXPLICIT_CONSENT_REQUIRED/);
});

test("acceptance, revocation, and reissue routes enforce the versioned contract", () => {
  const acceptRoute = readApp("app/api/salon/match/[code]/route.ts");
  const revokeRoute = readApp("app/api/salon/matches/[requestId]/route.ts");
  const inviteRoute = readApp("app/api/salon/matching/invite/route.ts");
  const customerRoute = readApp("app/api/salon/customers/[id]/route.ts");

  assert.match(acceptRoute, /isSalonConnectionConsentAcceptance\(body\)/);
  assert.match(acceptRoute, /accept_salon_match_invite/);
  assert.match(revokeRoute, /userId !== ownerUserId && userId !== memberUserId/);
  assert.match(revokeRoute, /revoke_salon_connection/);
  assert.match(inviteRoute, /p_confirm_replace: body\.confirmReplace === true/);
  assert.match(inviteRoute, /INVITE_REISSUE_CONFIRMATION_REQUIRED/);
  assert.match(customerRoute, /\.eq\("status", "linked"\)/);
  assert.match(customerRoute, /\.eq\("consent_version", SALON_CONNECTION_CONSENT_VERSION\)/);
  assert.match(customerRoute, /"Cache-Control": "private, no-store"/);
});

test("web and Expo expose explicit consent and member-visible disconnect", () => {
  const webInvite = readApp("components/salon/MatchInviteClient.tsx");
  const webConnections = readApp("components/salon/SalonConnectionsClient.tsx");
  const mobileInvite = readRepo("apps/hairfit-app/app/salon/match/[code].tsx");
  const mobileConnections = readRepo("apps/hairfit-app/app/salon/connections.tsx");
  const privacy = readApp("app/privacy-policy/page.tsx");

  assert.match(webInvite, /동의하고 연결 요청/);
  assert.match(webInvite, /공유하지 않음/);
  assert.match(webConnections, /연결 해제/);
  assert.match(mobileInvite, /saveSalonMatchResumeTarget/);
  assert.match(mobileInvite, /동의하고 연결 요청/);
  assert.match(mobileConnections, /revokeSalonConnection/);
  assert.match(privacy, /일반 HairFit 기능 이용은 제한되지 않습니다/);
});
