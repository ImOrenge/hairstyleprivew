import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(appRoot, "app", "page.tsx"), "utf8");
const hero = readFileSync(join(appRoot, "components", "home", "HeroSection.tsx"), "utf8");
const showcases = readFileSync(join(appRoot, "components", "home", "PremiumConsultingShowcases.tsx"), "utf8");
const pricing = readFileSync(join(appRoot, "components", "home", "PricingPreview.tsx"), "utf8");
const content = readFileSync(join(appRoot, "lib", "home-content.ts"), "utf8");
const mobileCta = readFileSync(join(appRoot, "components", "home", "MobileStickyCtaBar.tsx"), "utf8");
const autoSwitch = readFileSync(join(appRoot, "components", "home", "PremiumAutoSwitchPreviewPanel.tsx"), "utf8");

test("premium landing keeps the rolling hero and consultant message", () => {
  assert.match(hero, /ROLLING_COLUMNS/);
  assert.match(hero, /data-testid="hero-rolling-stage"/);
  assert.match(hero, /당신의 스타일에는,/);
  assert.match(hero, /생성보다 정확한 기준이 필요합니다\./);
  assert.match(hero, /PRIVATE AI STYLE DIRECTION/);
  assert.match(hero, /href="#style-dossier"/);
  assert.match(hero, /컨설팅 결과 예시 보기/);
  assert.match(hero, /aria-label="SCROLL — 분석 근거 섹션으로 이동"/);
});

test("landing exposes the documented eleven scene order", () => {
  const componentOrder = ["HeroSection", "AnalysisEvidenceShowcase", "DirectionShowcase", "StrategicPreviewShowcase", "CompareDecisionShowcase", "SalonBriefShowcase", "AftercareTimelineShowcase", "FashionDirectionShowcase", "StyleDossierShowcase", "PricingPreview", "TrustAndFinalCta"];
  let cursor = -1;
  const renderedPage = page.slice(page.indexOf("return ("));
  for (const name of componentOrder) {
    const index = renderedPage.indexOf(`<${name}`, cursor + 1);
    assert.ok(index > cursor, `${name} must appear after the previous scene`);
    cursor = index;
  }
  for (const id of ["analysis-evidence", "user-direction", "strategic-preview", "compare-decision", "salon-brief", "aftercare", "fashion-direction", "style-dossier", "trust"]) assert.match(showcases, new RegExp(`id=\\"${id}\\"`));
  assert.match(pricing, /id="services"/);
  assert.equal(content.match(/shortLabel: "(?:0[1-9]|1[01])"/g)?.length, 11);
});

test("proof artifacts map to current V2 vocabulary", () => {
  for (const term of ["Analysis Evidence", "랜드마크", "BALANCE", "IMAGE", "LIFESTYLE", "최종 후보", "Decision", "Salon Brief", "실제 시술 완료 후", "9-LOOK BATCH", "현재 제공", "예정 기능"]) {
    assert.match(showcases, new RegExp(term, "i"));
  }
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
    "현재 체크인",
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
});

function compareRows(source: string) {
  const block = source.match(/const compareRows = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  return block.match(/^\s*\[/gm)?.length ?? 0;
}

test("conversion paths and pricing boundary remain truthful", () => {
  const combined = `${page}\n${hero}\n${showcases}\n${mobileCta}\n${pricing}`;
  assert.doesNotMatch(combined, /\/workspace/);
  assert.doesNotMatch(combined, /무료로 내 스타일 보기/);
  assert.doesNotMatch(combined, /99,?000|189,?000|649,?000/);
  assert.ok((combined.match(/href="\/consulting\/new"/g)?.length ?? 0) >= 4);
  assert.match(showcases, /href="\/b2b\/contact"/);
  assert.match(pricing, /PricingTierKey/);
  assert.match(pricing, /aria-label="현재 이용 가능한 플랜 비교"/);
  assert.match(pricing, /id="pricing-scroll-hint"/);
  assert.match(pricing, /data-variant=\{plan\.tone === "basic" \? "secondary" : "primary"\}/);
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
