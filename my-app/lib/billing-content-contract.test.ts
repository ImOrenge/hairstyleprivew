import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const sharedPolicy = read("../../packages/shared/src/billing/subscription-policy.ts");
const webBilling = read("../app/billing/page.tsx");
const webUsagePackCatalog = read("../components/billing/UsagePackCatalog.tsx");
const webMyPagePlan = read("../components/mypage/panels/MyPagePlanPanel.tsx");
const webRefund = read("../components/mypage/RefundInterviewFlow.tsx");
const webCheckout = read("../app/billing/checkout/page.tsx");
const webCheckoutForm = read("../components/payments/PortoneCheckoutForm.tsx");
const webCancellation = read("../components/mypage/SubscriptionCancelButton.tsx");
const webTerms = read("../app/terms-of-service/page.tsx");
const nativeBilling = read("../../apps/hairfit-app/app/billing.tsx");
const nativeGooglePlayBilling = read("../../apps/hairfit-app/components/billing/GooglePlayBillingScreen.tsx");
const nativeMyPagePlan = read("../../apps/hairfit-app/components/mypage/panels/MobileMyPagePlanPanel.tsx");
const nativeRefund = read("../../apps/hairfit-app/components/mypage/MobileRefundInterviewFlow.tsx");
const mobileDashboardRoute = read("../app/api/mobile/dashboard/route.ts");
const nativeTerms = read("../../apps/hairfit-app/app/legal/terms.tsx");

test("shared policy states renewal, credit grant, unused-credit, and cancellation behavior", () => {
  assert.match(sharedPolicy, /id: "renewal"/);
  assert.match(sharedPolicy, /id: "creditGrant"/);
  assert.match(sharedPolicy, /id: "unusedCredits"/);
  assert.match(sharedPolicy, /id: "cancellation"/);
  assert.match(sharedPolicy, /기존 잔액에 추가/);
  assert.match(sharedPolicy, /해지 예약만으로 삭제되지 않습니다/);
  assert.match(sharedPolicy, /다음 자동결제부터 중단/);
});

test("web billing surfaces disclose the applicable policy before payment and link legal/support routes", () => {
  assert.match(webBilling, /SubscriptionPolicyDisclosure/);
  assert.match(webBilling, /UsagePackCatalog/);
  assert.match(webUsagePackCatalog, /getUsagePacks/);
  assert.match(webUsagePackCatalog, /billing\/usage\?pack=\$\{item\.key\}/);
  assert.match(webCheckout, /정기결제·해지 정책/);
  assert.match(webCheckoutForm, /결제 전 필수 안내/);

  const disclosure = read("../components/billing/SubscriptionPolicyDisclosure.tsx");
  assert.match(disclosure, /WEB_SUBSCRIPTION_BILLING_POLICY_KO\.map/);
  assert.match(disclosure, /item\.id !== "unusedCredits"/);
  assert.match(disclosure, /title: "월 이용권 등록"/);
  assert.doesNotMatch(disclosure, /title: "미사용 이용권"|잔여분/);
  assert.match(disclosure, /href="\/terms-of-service"/);
  assert.match(disclosure, /href="\/privacy-policy"/);
  assert.match(disclosure, /href="\/support"/);
});

test("plan surfaces separate benefit details from product checkout", () => {
  assert.match(webMyPagePlan, /getPlanDisplayBenefit/);
  assert.match(webMyPagePlan, /href="\/billing"/);
  assert.match(webMyPagePlan, /현재 플랜 혜택/);
  assert.doesNotMatch(webMyPagePlan, /PortoneSubscriptionButton|selfServePlans/);
  assert.match(mobileDashboardRoute, /billingPlanBenefits/);
  assert.match(mobileDashboardRoute, /usagePacks/);
  assert.match(nativeMyPagePlan, /billingPlanBenefits/);
  assert.match(nativeMyPagePlan, /router\.push\("\/billing"\)/);
  assert.match(nativeBilling, /usagePacks/);
  assert.match(nativeBilling, /getHairfitApiBaseUrl/);
  assert.match(nativeBilling, /billing\/usage\?pack=/);
});

test("plan and billing surfaces use usage language instead of credit copy", () => {
  for (const source of [
    webBilling,
    webUsagePackCatalog,
    webMyPagePlan,
    webRefund,
    nativeBilling,
    nativeGooglePlayBilling,
    nativeMyPagePlan,
    nativeRefund,
  ]) {
    assert.doesNotMatch(source, /크레딧/);
  }
});

test("subscription cancellation requires confirmation and explains the period-end effect", () => {
  assert.match(webCancellation, /ConfirmActionDialog/);
  assert.match(webCancellation, /기간 종료 후 해지 예약/);
  assert.doesNotMatch(webCancellation, /getSubscriptionBillingPolicyKo\("unusedCredits"\)|unusedCreditPolicy/);
  assert.match(webCancellation, /role="alert"/);
});

test("native billing and both terms screens consume the same policy source", () => {
  for (const source of [nativeBilling, nativeTerms, webTerms]) {
    assert.match(source, /SUBSCRIPTION_BILLING_POLICY_KO/);
  }
  assert.match(nativeBilling, /router\.push\("\/legal\/terms"\)/);
  assert.match(nativeBilling, /router\.push\("\/legal\/privacy"\)/);
});
