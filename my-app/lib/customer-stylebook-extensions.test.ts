import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const migration = read("../../supabase/migrations/20260826100028_customer_stylebook_extensions.sql");
const migrationMirror = read("../supabase/migrations/20260826100028_customer_stylebook_extensions.sql");
const actions = read("./v2/customer-stylebook-actions-server.ts");
const metadata = read("./v2/customer-stylebook-metadata-server.ts");
const route = read("../app/api/mobile/stylebook/route.ts");
const workspace = read("../components/customer/stylebook/CustomerStylebookWorkspace.tsx");
const collection = read("../components/customer/CustomerStylebookCollection.tsx");
const mobile = read("../../apps/hairfit-app/components/customer/NativeStylebookCollection.tsx");
const mobileConsulting = read("../../apps/hairfit-app/app/consulting.tsx");

test("stylebook extension migration is mirrored and keeps customer metadata service-role only", () => {
  assert.equal(migration, migrationMirror);
  for (const table of [
    "customer_stylebook_item_states_v2",
    "customer_stylebook_collections_v2",
    "customer_stylebook_collection_items_v2",
    "customer_stylebook_wear_logs_v2",
    "customer_stylebook_shares_v2",
    "customer_stylebook_consultation_references_v2",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`, "i"));
    assert.match(migration, new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`, "i"));
  }
  assert.match(migration, /stylebook-wear-photos/);
  assert.match(migration, /values\s*\(\s*'stylebook-wear-photos',\s*'stylebook-wear-photos',\s*false/);
  assert.match(migration, /queue_stylebook_wear_photos_on_user_delete_v2/);
});

test("web and mobile expose the same management actions and never route to legacy results", () => {
  for (const source of [workspace, route]) {
    for (const action of ["collection", "share", "reference", "wear_log"]) assert.match(source, new RegExp(action));
  }
  for (const source of [collection, mobile]) {
    assert.match(source, /filterCustomerStylebookEntriesV2/);
    assert.match(source, /favorite/i);
    assert.match(source, /compare/i);
    assert.match(source, /wear/i);
    assert.match(source, /share/i);
    assert.doesNotMatch(source, /\/result\/v2\/|`\/result\/|credit|크레딧/i);
  }
  assert.match(route, /export async function PATCH/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);
  assert.match(metadata, /deriveSets/);
});

test("referenced consultation stores context separately and preserves the existing flow", () => {
  assert.match(actions, /createServerConsultation/);
  assert.match(actions, /customer_stylebook_consultation_references_v2/);
  assert.match(actions, /new_consultation_id: snapshot\.sessionId/);
  assert.doesNotMatch(actions, /completed_stages|current_stage|stage_payloads/);
  assert.match(mobileConsulting, /기존 컨설팅 단계, 질문, 순서와 결과 확정 방식은 변경하지 않습니다/);
});

test("public share responses strip private stylebook metadata unless explicitly selected", () => {
  assert.match(actions, /const publicItem: StylebookEntry/);
  assert.match(actions, /note: ""/);
  assert.match(actions, /tags: \[\]/);
  assert.match(actions, /privateNote: row\.include_private_note \? entry\.state\.note : null/);
  assert.match(actions, /actualPhotoUrl: wearLog\?\.photoUrl \?\? null/);
});
