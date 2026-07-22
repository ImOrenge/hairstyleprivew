import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const home = read("../app/home/page.tsx");
const dashboard = read("./customer-home-data.ts");
const confirmedStyleMedia = read("./confirmed-style-media.ts");
const mobileHome = read("../../apps/hairfit-app/app/index.tsx");
const mobileAftercareApi = read("../app/api/mobile/aftercare/route.ts");
const confirmedStyleSurfaces = [
  dashboard,
  read("../app/mypage/page.tsx"),
  read("../app/aftercare/page.tsx"),
  mobileAftercareApi,
  read("../app/api/mobile/aftercare/[hairRecordId]/route.ts"),
];
const webUsage = read("../components/mypage/panels/MyPageUsagePanel.tsx");
const mobileUsage = read("../../apps/hairfit-app/components/mypage/panels/MobileMyPageUsagePanel.tsx");

test("customer dashboards load confirmation records with the selected hairstyle image", () => {
  assert.match(dashboard, /from<ConfirmedStyleRow>\("user_hair_records"\)/);
  assert.match(dashboard, /generation:generations\(selected_variant_id,options\)/);
  assert.match(dashboard, /recentConfirmedStyles:/);
  assert.match(mobileAftercareApi, /selectedVariantImageUrl: media\.selectedVariantImageUrl/);
});

test("confirmed cards prefer the durable selected variant column over stale option metadata", () => {
  assert.match(confirmedStyleMedia, /generation\?\.selected_variant_id/);
  assert.match(confirmedStyleMedia, /getConfirmedStyleVariantMediaSummary\(/);
  for (const source of confirmedStyleSurfaces) {
    assert.match(source, /generation:generations\(selected_variant_id,options\)/);
    assert.match(source, /getConfirmedStyleMediaFromRelation/);
  }
});

test("web and native home replace generation history with confirmed treatment cards", () => {
  for (const source of [home, mobileHome]) {
    assert.match(source, /recentConfirmedStyles/);
    assert.match(source, /시술 확정 목록/);
    assert.match(source, /selectedVariantImageUrl/);
    assert.doesNotMatch(source, />헤어 생성 기록</);
  }
});

test("generation monitoring remains available as a clearly separated work-status surface", () => {
  assert.match(webUsage, /헤어 생성 작업 현황/);
  assert.match(webUsage, /대기·진행·완료·실패/);
  assert.match(mobileUsage, /헤어 생성 작업 현황/);
  assert.match(mobileUsage, /대기·진행·완료·실패/);
});
