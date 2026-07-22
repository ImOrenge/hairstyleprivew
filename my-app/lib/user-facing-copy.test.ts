import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getSafePaymentFailureCopy,
  getSafeRefundFailureCopy,
  getSafeSubscriptionFailureCopy,
} from "../components/mypage/myPageSafeCopy.ts";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("billing and account formatters never expose provider messages, codes, or unknown enums", () => {
  const paymentCopy = getSafePaymentFailureCopy("PROVIDER_DECLINED_91", true);
  const subscriptionCopy = getSafeSubscriptionFailureCopy("INTERNAL_TIMEOUT_X1", true);
  const refundCopy = getSafeRefundFailureCopy(true);
  assert.match(paymentCopy ?? "", /카드 상태|다른 카드/);
  assert.match(subscriptionCopy ?? "", /결제 상태/);
  assert.match(refundCopy ?? "", /환불 처리/);
  for (const copy of [paymentCopy, subscriptionCopy, refundCopy]) {
    assert.doesNotMatch(copy ?? "", /PROVIDER|private|payload|trace|response/i);
  }

  const formatterSource = read("../components/mypage/myPageFormatters.ts");
  for (const safeFallback of [
    "플랜 정보 확인 필요",
    "상태 확인 필요",
    "결제 상태 확인 필요",
    "환불 상태 확인 필요",
    "상태 확인 중",
  ]) {
    assert.match(formatterSource, new RegExp(safeFallback));
  }
  assert.doesNotMatch(formatterSource, /return message \|\| code|return normalized;/);
});

test("customer payment surfaces explain state and recovery without developer terminology", () => {
  const sources = [
    read("../app/billing/page.tsx"),
    read("../app/billing/checkout/page.tsx"),
    read("../components/billing/PaidActionQuoteCard.tsx"),
    read("../components/layout/SubscriptionPaymentNoticeModal.tsx"),
    read("../components/mypage/panels/MyPagePlanPanel.tsx"),
    read("../components/payments/PortoneSubscriptionButton.tsx"),
    read("../components/payments/SubscriptionWaitlistForm.tsx"),
    read("../../apps/hairfit-app/app/billing.tsx"),
  ].join("\n");

  assert.doesNotMatch(
    sources,
    /PortOne Checkout|Subscription Waitlist|Payment Notice|카드 빌링키|PG 연동|웨잇리스트|웹훅 처리|웹훅:|결제 취소 API|서버 크레딧 견적|서버 검증|서버 상태/,
  );
  assert.match(sources, /안전한 결제창/);
  assert.match(sources, /최신 크레딧 견적/);
  assert.match(sources, /결제 상태 다시 확인/);

  const adminB2b = read("../app/admin/b2b/page.tsx");
  const adminRefunds = read("../app/admin/refunds/page.tsx");
  assert.match(adminB2b, />외부 전달</);
  assert.doesNotMatch(adminB2b, />웹훅</);
  assert.match(adminRefunds, /결제 취소 요청을 다시 보내지 않습니다/);
  assert.doesNotMatch(adminRefunds, /결제 취소 API를 중복 호출하지 않습니다/);
});

test("selection, confirmation, retry, regeneration, and payment return keep distinct meanings", () => {
  const toolbar = read("../components/result/ActionToolbar.tsx");
  const switcher = read("../components/result/VariantSwitcherGrid.tsx");
  const quote = read("../components/billing/PaidActionQuoteCard.tsx");
  const generation = read("../app/generate/[id]/page.tsx");
  const mobileGeneration = read("../../apps/hairfit-app/app/generate/[id].tsx");
  const mobileGenerationEntry = read("../../apps/hairfit-app/app/generate.tsx");

  assert.match(toolbar, /시술 계획 확정/);
  assert.match(toolbar, /다른 스타일 다시 생성 · 비용 확인/);
  assert.match(toolbar, /최신 10크레딧 비용과 잔액/);
  assert.match(switcher, /선택됨/);
  assert.match(switcher, /확정됨/);
  assert.match(switcher, /시술 확정 후에는 이 결과 안에서 다른 스타일로 바꿀 수 없습니다/);
  assert.match(quote, /결제를 마치고 돌아오면 자동 실행하지 않고 최신 견적을 다시 확인합니다/);
  assert.match(generation, /실패한 후보만 다시 시도/);
  assert.match(generation, /실패한 후보 다시 시도/);
  assert.doesNotMatch(
    generation,
    /Recommendation Board|Nine tailored|Variant failed|Rendering AI preview|Waiting in queue|Pending score|Open Result|"Retrying|>Retry</,
  );
  assert.doesNotMatch(generation, /\{variant\.error\}|\{preparationError\}/);
  assert.match(mobileGeneration, /실패한 후보 다시 시도/);
  assert.doesNotMatch(
    mobileGeneration,
    /Recommendation Board|Nine tailored|Variant failed|Rendering AI preview|Waiting in queue|Pending score|Open Result|Retrying|Render again/,
  );
  assert.doesNotMatch(mobileGeneration, /<BodyText style=\{styles\.errorText\}>\{variant\.error\}/);
  assert.doesNotMatch(mobileGenerationEntry, /<Kicker>Generate|Nine tailored|Upload required|Choose portrait|멱등/);
});

test("audited static UI copy keeps implementation and generic English labels off user screens", () => {
  const auditedSources = [
    read("../app/billing/page.tsx"),
    read("../app/home/page.tsx"),
    read("../app/support/page.tsx"),
    read("../components/home/AccountSetupPromptModal.tsx"),
    read("../components/home/B2BLeadForm.tsx"),
    read("../components/mypage/MyPageDashboardTabs.tsx"),
    read("../components/personal-color/PersonalColorDiagnosisProgress.tsx"),
    read("../components/salon/SalonConnectionsClient.tsx"),
    read("../components/workspace/WorkspaceWizard.tsx"),
    read("../../apps/hairfit-app/app/(auth)/login.tsx"),
    read("../../apps/hairfit-app/app/(auth)/signup.tsx"),
    read("../../apps/hairfit-app/app/account.tsx"),
    read("../../apps/hairfit-app/app/index.tsx"),
    read("../../apps/hairfit-app/app/payments/complete.tsx"),
    read("../../apps/hairfit-app/app/upload.tsx"),
    read("../../apps/hairfit-app/components/PersonalColorDiagnosisProgress.tsx"),
    read("../../apps/hairfit-app/components/styler/MobileStylerNewView.tsx"),
    read("../components/styler/StylerNewView.tsx"),
  ].join("\n");

  assert.doesNotMatch(
    auditedSources,
    /Account Setup|Admin Dashboard|App Home|Hair History|Style History|Personal Color Scan|Analysis Preview|Warm \/ Cool|Privacy &amp; consent|NEXT_PUBLIC_TURNSTILE_SITE_KEY 설정이 필요합니다|NEXT_PUBLIC_CLERK|Clerk publishable|멱등|임시 서명 링크|결제 콜백 정보/,
  );
  assert.match(auditedSources, /보안 확인을 준비하지 못했습니다/);
  assert.match(auditedSources, /개인정보 및 동의/);
  assert.match(auditedSources, /팔레트 비교 과정/);
});

test("the written glossary records the same user-facing action boundaries", () => {
  const glossary = read("../../docs/frontend-uiux-improvement-plan/copy-terminology-contract.md");
  for (const term of ["선택", "시술 계획 확정", "변경 불가", "비용", "재시도", "다시 생성", "결제 후 복귀"]) {
    assert.match(glossary, new RegExp(term));
  }
  assert.match(glossary, /API·webhook·base64/);
});
