import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(appRoot, "app", "page.tsx"), "utf8");
const hero = readFileSync(join(appRoot, "components", "home", "HeroSection.tsx"), "utf8");
const showcases = readFileSync(join(appRoot, "components", "home", "PremiumConsultingShowcases.tsx"), "utf8");
const offers = readFileSync(join(appRoot, "components", "home", "PremiumOfferPreview.tsx"), "utf8");
const offerPolicy = readFileSync(join(appRoot, "lib", "premium-offer-policy.ts"), "utf8");
const content = readFileSync(join(appRoot, "lib", "home-content.ts"), "utf8");
const mobileCta = readFileSync(join(appRoot, "components", "home", "MobileStickyCtaBar.tsx"), "utf8");
const autoSwitch = readFileSync(join(appRoot, "components", "home", "PremiumAutoSwitchPreviewPanel.tsx"), "utf8");

test("premium landing keeps the rolling hero and consultant message", () => {
  assert.match(hero, /ROLLING_COLUMNS/);
  assert.match(hero, /data-testid="hero-rolling-stage"/);
  assert.match(hero, /사진 한 장으로 퍼스널 컬러를 찾고/);
  assert.match(hero, /내게 맞는 헤어를 실제로 만들어 보세요\./);
  assert.match(hero, /계정당 1회 · 실제 헤어 9개 생성 · 비교 직전 유료 전환/);
  assert.match(hero, /href="#style-dossier"/);
  assert.match(hero, /9가지 결과 예시 보기/);
  assert.match(hero, /aria-label="SCROLL — 분석 근거 섹션으로 이동"/);
});

test("landing exposes the documented 00 through 11 consultation journey", () => {
  const componentOrder = ["HeroSection", "AnalysisEvidenceShowcase", "DirectionShowcase", "StrategicPreviewShowcase", "CompareDecisionShowcase", "SalonBriefShowcase", "MakeupDirectionShowcase", "FashionDirectionShowcase", "StyleDossierShowcase", "AftercareTimelineShowcase", "TrustShowcase", "PremiumOfferPreview"];
  let cursor = -1;
  const renderedPage = page.slice(page.indexOf("return ("));
  for (const name of componentOrder) {
    const index = renderedPage.indexOf(`<${name}`, cursor + 1);
    assert.ok(index > cursor, `${name} must appear after the previous scene`);
    cursor = index;
  }
  for (const id of ["analysis-evidence", "user-direction", "strategic-preview", "compare-decision", "salon-brief", "makeup-direction", "fashion-direction", "style-dossier", "aftercare", "trust"]) assert.match(showcases, new RegExp(`id=\\"${id}\\"`));
  assert.match(offers, /id="services"/);
  assert.equal(content.match(/shortLabel: "(?:0[0-9]|1[01])"/g)?.length, 12);
  for (const [id, number] of [["analysis-evidence", "01"], ["user-direction", "02"], ["strategic-preview", "03"], ["compare-decision", "04"], ["salon-brief", "05"], ["makeup-direction", "06"], ["fashion-direction", "07"], ["style-dossier", "08"], ["aftercare", "09"], ["trust", "10"]]) {
    assert.match(showcases, new RegExp(`id=\\"${id}\\" number=\\"${number}\\"`));
  }
  assert.match(hero, /className=\{styles\.sceneNumber\}[^>]*>00/);
});

test("proof artifacts map to current V2 vocabulary", () => {
  for (const term of ["Analysis Evidence", "랜드마크", "BALANCE", "IMAGE", "LIFESTYLE", "최종 헤어 1개", "Decision", "Salon Brief", "AI 메이크업 디렉터 리포트", "현재 제공", "예정 기능"]) {
    assert.match(showcases, new RegExp(term, "i"));
  }
  assert.match(showcases, /3 \+ 3 \+ 3/i);
});

test("core scenes expose decision-grade consulting artifacts", () => {
  for (const term of [
    "FACE MIX",
    "PHOTO QUALITY",
    "STRATEGY FIELD",
    "EVIDENCE & IMPACT",
    "판단 기준",
    "현재 모발 적합",
    "SALON HANDOFF",
    "현장 확인",
    "TODAY",
      "현재 안내",
    "PALETTE",
    "NECKLINE",
    "FACE PROFILE",
    "CARE PROTOCOL",
  ]) assert.match(showcases, new RegExp(term, "i"));
  assert.equal(compareRows(showcases), 8);
  assert.match(showcases, /aria-label="동일 구도 후보 이미지 비교"[^>]*tabIndex=\{0\}/);
  assert.match(showcases, /aria-label="후보별 8개 판단축 비교표"[^>]*tabIndex=\{0\}/);
  assert.match(showcases, /id="compare-scroll-hint"/);
  assert.match(showcases, /컨설팅 결과 연결 증거/);
  assert.match(showcases, /8개 판단 기준/);
  assert.match(showcases, /살롱 전달/);
  assert.match(showcases, /시술 후 관리/);
  for (const checkpoint of ["D\\+1", "D\\+3", "D\\+7", "D\\+30", "D\\+45", "D\\+90"]) assert.match(showcases, new RegExp(checkpoint));
  assert.doesNotMatch(showcases, /WEEK 02|WEEK 08/);
  assert.match(showcases, /1회 플랜[\s\S]*?D\+30 · 1회/);
  assert.match(showcases, /3개월 플랜[\s\S]*?D\+30·60·90 · 3회/);
  assert.match(showcases, /연간 플랜[\s\S]*?연 4개 상담 각각 D\+30·60·90/);
});

function compareRows(source: string) {
  const block = source.match(/const compareRows = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  return block.match(/^\s*\[/gm)?.length ?? 0;
}

test("free demo, shared paid scope, and approved price boundary remain truthful", () => {
  const combined = `${page}\n${hero}\n${showcases}\n${mobileCta}\n${offers}\n${offerPolicy}`;
  assert.doesNotMatch(combined, /\/workspace/);
  assert.doesNotMatch(combined, /무료로 내 스타일 보기/);
  for (const price of ["59,000원", "89,000원", "299,000원"]) assert.match(offerPolicy, new RegExp(price));
  assert.match(offerPolicy, /priceLabel: "89,000원",[\s\S]*?periodLabel: "\/ 3개월"/);
  assert.equal(offerPolicy.match(/recommended: true/g)?.length, 1);
  assert.match(offerPolicy, /key: "full_style_quarterly"[\s\S]*?recommended: true/);
  for (const benefit of ["정밀 퍼스널 컬러 진단", "실제 헤어 3×3 생성", "최종 헤어 1개 확정", "최대 6개 추가 생성", "Salon Brief·AI 결과 해설·PDF·애프터케어"]) {
    assert.match(offerPolicy, new RegExp(benefit));
  }
  for (const type of ["1회 완결형", "3개월 정기형", "연간 관리형"]) assert.match(offerPolicy, new RegExp(type));
  assert.match(offers, /결제 전에 직접 확인하는 범위/);
  assert.match(offerPolicy, /부가세를 포함한 실제 승인 총액/);
  assert.match(offerPolicy, /free_hair_demo/);
  assert.match(offerPolicy, /워터마크 헤어 3×3/);
  assert.doesNotMatch(`${offers}\n${offerPolicy}`, /계절별 관리|seasonal/i);
  assert.match(offerPolicy, /가격 확정/);
  assert.match(offerPolicy, /미사용 회차가 이월되지 않으며/);
  assert.doesNotMatch(offers, /PortoneSubscriptionButton/);
  assert.equal(offerPolicy.match(/\n\s+key: /g)?.length, 4);
  assert.match(offers, /PREMIUM_OFFER_POLICY\.freeDemo/);
  assert.equal(offers.match(/href="\/consulting\/new"/g)?.length, 1);
  assert.ok((combined.match(/href="\/consulting\/new"/g)?.length ?? 0) >= 4);
  assert.match(offers, /href="\/consulting\/plans"/);
  assert.match(offers, /href="\/billing"/);
  assert.match(offers, /관리 안내 6회\(D\+1·3·7·30·45·90\)/);
  assert.match(offers, /전체 재시작 1회 · AI 사후상담 D\+30 1회/);
  assert.match(offers, /상담당 전체 재시작 2회 · AI 사후상담 D\+30·60·90 3회/);
  assert.match(offers, /각 상담 전체 재시작 5회 · AI 사후상담 D\+30·60·90 3회/);
  assert.match(offerPolicy, /무료 3×3 생성 시작/);
  assert.ok(page.indexOf("<TrustShowcase") < page.indexOf("<PremiumOfferPreview"));
  for (const phrase of ["변경할 수 없는 최종 결정 기록", "변경 불가 최종 결정 기록", "데이터 계약에서 확인할 수 있는 연결 범위", "슬롯마다 반복 요청하는 마법사 흐름", "생성보다 정확한 기준"]) {
    assert.doesNotMatch(combined, new RegExp(phrase));
  }
});

test("mobile CTA leaves the final conversion and footer unobstructed", () => {
  assert.match(mobileCta, /document\.querySelector\("\.f-premium-final"\)/);
  assert.match(mobileCta, /document\.querySelector\("footer"\)/);
  assert.match(mobileCta, /visibleClosingTargets/);
  assert.match(mobileCta, /setIsVisible\(!heroIsVisible && visibleClosingTargets\.size === 0\)/);
  assert.match(mobileCta, /closingObserver\.observe\(target\)/);
});

test("hair and fashion previews auto-switch female and male models accessibly", () => {
  assert.match(showcases, /StrategicHairPreviewPanel/);
  assert.match(showcases, /FashionDirectionPreviewPanel/);
  assert.match(autoSwitch, /window\.setInterval/);
  assert.match(autoSwitch, /5000/);
  assert.match(autoSwitch, /prefers-reduced-motion: reduce/);
  assert.match(autoSwitch, /IntersectionObserver/);
  assert.match(autoSwitch, /role="tablist"/);
  assert.match(autoSwitch, /aria-selected=\{gender === item\}/);
  assert.match(autoSwitch, /\$\{state\.gender\}-v2-/);
  assert.match(autoSwitch, /male-short-clean-v3\.webp/);
  assert.match(autoSwitch, /female-short-soft-v3\.webp/);
  assert.match(autoSwitch, /onPointerEnter/);
  assert.match(autoSwitch, /onFocusCapture/);
});
