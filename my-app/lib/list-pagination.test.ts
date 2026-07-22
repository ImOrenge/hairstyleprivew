import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LatestRequestGuard } from "../../packages/api-client/src/latest-request-guard.ts";
import { collectCursorFilteredPage, type CursorPosition } from "./cursor-filtered-page.ts";
import { decodeListCursor, encodeListCursor } from "./list-cursor.ts";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("list cursor round-trips deterministic sort and id values", () => {
  const cursor = encodeListCursor("2026-07-15T12:00:00.000Z", "row-42");
  assert.deepEqual(decodeListCursor(cursor), {
    id: "row-42",
    sortValue: "2026-07-15T12:00:00.000Z",
  });
});

test("invalid and legacy cursor values fail closed", () => {
  assert.equal(decodeListCursor(null), null);
  assert.equal(decodeListCursor("not-base64-json"), null);
  assert.equal(decodeListCursor(Buffer.from(JSON.stringify({ version: 2, id: "a", sortValue: "b" })).toString("base64url")), null);
  assert.equal(
    decodeListCursor(
      Buffer.from(
        JSON.stringify({ version: 1, id: "row-1),status.eq.admin", sortValue: "2026-07-15T12:00:00.000Z" }),
      ).toString("base64url"),
    ),
    null,
  );
  assert.equal(
    decodeListCursor(
      Buffer.from(JSON.stringify({ version: 1, id: "row-1", sortValue: "not-a-timestamp" })).toString("base64url"),
    ),
    null,
  );
});

test("filtered cursor scanner reaches every row in a 125 candidate fixture without duplicates", async () => {
  const fixture = Array.from({ length: 125 }, (_, index) => ({
    id: `candidate-${String(index + 1).padStart(3, "0")}`,
    updatedAt: new Date(Date.UTC(2026, 6, 17, 12, Math.floor(index / 5))).toISOString(),
  })).sort((left, right) => {
    return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
  });

  const loadFixtureBatch = async (cursor: CursorPosition | null, batchSize: number) => {
    const cursorIndex = cursor
      ? fixture.findIndex((row) => row.id === cursor.id && row.updatedAt === cursor.sortValue)
      : -1;
    return fixture.slice(cursorIndex + 1, cursorIndex + 1 + batchSize).map((row) => ({
      cursor: { id: row.id, sortValue: row.updatedAt },
      value: row.id,
    }));
  };

  const reached: string[] = [];
  let cursor: CursorPosition | null = null;
  let pageCount = 0;
  do {
    const page: { items: string[]; nextCursor: CursorPosition | null; scanned: number } = await collectCursorFilteredPage({
      cursor,
      limit: 20,
      batchSize: 17,
      loadBatch: loadFixtureBatch,
    });
    assert.ok(page.items.length <= 20);
    reached.push(...page.items);
    cursor = page.nextCursor;
    pageCount += 1;
  } while (cursor);

  assert.equal(pageCount, 7);
  assert.equal(reached.length, 125);
  assert.equal(new Set(reached).size, 125);
  assert.deepEqual(reached, fixture.map((row) => row.id));
});

test("filtered cursor scanner finds matches beyond the first 100 raw rows", async () => {
  const fixture = Array.from({ length: 240 }, (_, index) => ({
    id: `raw-${String(index + 1).padStart(3, "0")}`,
    updatedAt: new Date(Date.UTC(2026, 6, 17, 12) - index * 1_000).toISOString(),
    matches: index >= 120 && index % 13 === 0,
  }));

  const page = await collectCursorFilteredPage({
    cursor: null,
    limit: 3,
    batchSize: 25,
    loadBatch: async (cursor, batchSize) => {
      const cursorIndex = cursor
        ? fixture.findIndex((row) => row.id === cursor.id && row.updatedAt === cursor.sortValue)
        : -1;
      return fixture.slice(cursorIndex + 1, cursorIndex + 1 + batchSize).map((row) => ({
        cursor: { id: row.id, sortValue: row.updatedAt },
        value: row.matches ? row.id : null,
      }));
    },
  });

  assert.deepEqual(page.items, fixture.filter((row) => row.matches).slice(0, 3).map((row) => row.id));
  assert.ok(page.scanned > 100);
  assert.ok(page.nextCursor);
});

test("latest request guard rejects a late response after a newer search begins", () => {
  const guard = new LatestRequestGuard();
  const committed: string[] = [];
  const firstRequest = guard.begin();
  const secondRequest = guard.begin();

  if (guard.isCurrent(secondRequest)) committed.push("new-search");
  if (guard.isCurrent(firstRequest)) committed.push("stale-search");

  assert.deepEqual(committed, ["new-search"]);
  guard.invalidate();
  assert.equal(guard.isCurrent(secondRequest), false);
});

test("operational list APIs use stable compound ordering and limit plus one", () => {
  const createdAtApis = [
    read("my-app/app/api/admin/members/route.ts"),
    read("my-app/app/api/admin/reviews/route.ts"),
    read("my-app/app/api/admin/outbound-emails/route.ts"),
    read("my-app/app/api/admin/b2b/leads/route.ts"),
  ];
  const inbound = read("my-app/app/api/admin/inbound-emails/route.ts");
  const salon = read("my-app/app/api/salon/customers/route.ts");
  const salonMatches = read("my-app/app/api/salon/matches/route.ts");
  for (const source of createdAtApis) {
    assert.match(source, /order\("created_at"[\s\S]*order\("id"[\s\S]*limit\(limit \+ 1\)/);
    assert.match(source, /nextCursor:/);
    assert.match(source, /decodeListCursor/);
    assert.match(source, /Invalid pagination cursor/);
  }
  assert.match(inbound, /order\("received_at"[\s\S]*order\("id"[\s\S]*limit\(limit \+ 1\)/);
  assert.match(inbound, /nextCursor:/);
  assert.match(inbound, /decodeListCursor/);
  assert.match(inbound, /Invalid pagination cursor/);
  assert.match(salon, /order\("updated_at"[\s\S]*order\("id"[\s\S]*limit\(limit \+ 1\)/);
  assert.match(salon, /nextCursor:/);
  assert.match(salonMatches, /order\("updated_at"[\s\S]*order\("id"[\s\S]*limit\(batchSize\)/);
  assert.match(salonMatches, /collectCursorFilteredPage/);
  assert.match(salonMatches, /Invalid pagination cursor/);
  assert.match(salonMatches, /nextCursor:/);
});

test("web list clients cancel stale searches and expose loaded versus total", () => {
  const admin = read("my-app/app/admin/members/page.tsx");
  const reviews = read("my-app/app/admin/reviews/page.tsx");
  const inbox = read("my-app/app/admin/inbox/page.tsx");
  const b2b = read("my-app/app/admin/b2b/page.tsx");
  const salon = read("my-app/components/salon/CustomerListClient.tsx");
  for (const source of [admin, reviews, inbox, b2b, salon]) {
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /signal: controller\.signal/);
    assert.match(source, /현재 [\s\S]*총/);
    assert.match(source, /더 보기/);
  }
});

test("native operational lists own FlatList without a nested ScrollView", () => {
  const admin = read("apps/hairfit-app/app/admin/members.tsx");
  const reviews = read("apps/hairfit-app/app/admin/reviews.tsx");
  const inbox = read("apps/hairfit-app/app/admin/inbox.tsx");
  const b2b = read("apps/hairfit-app/app/admin/b2b.tsx");
  const salon = read("apps/hairfit-app/app/salon/customers/index.tsx");
  for (const source of [admin, reviews, inbox, b2b, salon]) {
    assert.match(source, /VirtualizedListScreen/);
    assert.match(source, /RefreshControl/);
    assert.match(source, /requestSequence/);
  }
  const listScreen = read("apps/hairfit-app/components/app/VirtualizedListScreen.tsx");
  assert.match(listScreen, /<AppScreen scroll=\{false\}/);
  assert.match(listScreen, /<FlatList/);
  assert.doesNotMatch(listScreen, /ScrollView/);
});

test("salon match pagination logs bounded structure without query or member identifiers", () => {
  const route = read("my-app/app/api/salon/matches/route.ts");
  assert.match(route, /event: "salon_match_pagination_read"/);
  assert.match(route, /event: "salon_match_pagination_failed"/);
  for (const field of ["status", "qApplied", "cursorApplied", "limit", "returned", "scanned", "hasMore"]) {
    assert.match(route, new RegExp(`\\b${field}(?::|,)`));
  }
  assert.match(route, /errorKind: paginationErrorKind\(error\)/);
  const logSection = route.slice(route.indexOf("console.info"));
  assert.doesNotMatch(logSection, /member_user_id|displayName|candidate\.member|email:/);
  assert.doesNotMatch(route, /console\.error\([^\n]*, error\)/);
});

test("salon match clients fence stale requests and expose bounded page navigation", () => {
  const web = read("my-app/components/salon/CustomerListClient.tsx");
  const native = read("apps/hairfit-app/app/salon/customers/index.tsx");
  for (const source of [web, native]) {
    assert.match(source, /LatestRequestGuard/);
    assert.match(source, /listSalonMatchCandidates|\/api\/salon\/matches/);
    assert.match(source, /현재 [\s\S]*명/);
    assert.match(source, />\s*이전\s*</);
    assert.match(source, />\s*다음\s*</);
  }
  assert.match(web, /candidateAbortController/);
  assert.match(native, /matchRequestGuard/);
});

test("non-aftercare operational screens label roles and declare whether they can change data", () => {
  const webMembers = read("my-app/app/admin/members/page.tsx");
  const webReviews = read("my-app/app/admin/reviews/page.tsx");
  const webInbox = read("my-app/app/admin/inbox/page.tsx");
  const webB2b = read("my-app/app/admin/b2b/page.tsx");
  const webSalon = read("my-app/components/salon/CustomerListClient.tsx");
  const nativeMembers = read("apps/hairfit-app/app/admin/members.tsx");
  const nativeMemberDetail = read("apps/hairfit-app/app/admin/members/[userId].tsx");

  assert.match(webMembers, /살롱 운영자/);
  assert.doesNotMatch(webMembers, />member</);
  assert.doesNotMatch(webMembers, />salon_owner</);
  assert.doesNotMatch(webMembers, />admin</);
  for (const source of [webMembers, webReviews, webInbox, webB2b, webSalon]) {
    assert.match(source, /조회[\s\S]*(변경|전용)|(변경|전용)[\s\S]*조회/);
  }
  for (const source of [nativeMembers, nativeMemberDetail]) {
    assert.match(source, /조회 전용/);
    assert.match(source, /웹 관리자/);
  }
  assert.match(webSalon, /관리자 대리 조회 모드/);
});

test("admin operational API clients preserve cursor compatibility", () => {
  const apiClient = read("packages/api-client/src/index.ts");
  for (const method of ["listAdminMembers", "listAdminReviews", "listAdminInboundEmails", "listAdminB2bLeads"]) {
    assert.match(apiClient, new RegExp(`${method}\\(options: \\{[^}]*cursor\\?: string`));
  }
  assert.ok((apiClient.match(/appendParam\(params, "cursor", options\.cursor\)/g) || []).length >= 5);
  assert.ok((apiClient.match(/nextCursor: string \| null/g) || []).length >= 4);
  assert.match(apiClient, /listSalonMatchCandidates\(options: \{[^}]*cursor\?: string/);
  assert.match(apiClient, /linkSalonMatchCandidate\(requestId: string\)/);
});

test("operational list E2E harness is fail-closed and uses the production salon client", () => {
  const harness = read("my-app/app/e2e-harness/operational-list/page.tsx");
  const browser = read("tests/web-e2e/operational-list-stability.spec.ts");
  const salon = read("my-app/components/salon/CustomerListClient.tsx");

  assert.match(harness, /E2E_UI_HARNESS_ENABLED !== "true"/);
  assert.match(harness, /notFound\(\)/);
  assert.match(harness, /<CustomerListClient/);
  assert.match(browser, /totalCustomers = 125/);
  assert.match(browser, /폐기되어야 할 이전 결과/);
  assert.match(browser, /seriousOrCriticalViolations/);
  assert.match(salon, /aria-label="고객 이름, 전화번호 또는 이메일 검색"/);
  assert.match(salon, /aria-label="고객 유입 경로 필터"/);
  assert.match(salon, /aria-labelledby="salon-customer-create-title"/);
});
