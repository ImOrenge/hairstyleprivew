import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mapWebResponseError, mapWebUserError, UserSafeError } from "./web-user-message.ts";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("web user error mapper hides provider details and preserves owned copy", () => {
  assert.equal(
    mapWebUserError(new Error("private provider detail"), "다시 시도해 주세요."),
    "다시 시도해 주세요.",
  );
  assert.equal(
    mapWebUserError(new UserSafeError("입력 정보를 확인해 주세요."), "다시 시도해 주세요."),
    "입력 정보를 확인해 주세요.",
  );
  assert.match(mapWebUserError({ status: 401 }, "fallback"), /로그인이 만료/);
  assert.match(mapWebUserError({ status: 403 }, "fallback"), /권한/);
  assert.match(mapWebUserError({ status: 413 }, "fallback", "photo"), /사진 용량/);
  assert.match(mapWebUserError({ status: 415 }, "fallback", "photo"), /JPEG, PNG, WebP/);
  assert.match(mapWebUserError({ status: 429 }, "fallback"), /요청이 많아/);
  assert.match(mapWebUserError({ status: 503 }, "fallback"), /서버에서 요청을 처리/);
  assert.match(mapWebUserError({ name: "TypeError" }, "fallback"), /네트워크 연결/);
  assert.match(mapWebResponseError(503, "fallback"), /서버에서 요청을 처리/);
});

test("non-aftercare web and mobile user surfaces do not render generic error.message", () => {
  const sources = [
    read("../app/generate/[id]/page.tsx"),
    read("../app/result/[id]/page.tsx"),
    read("../app/admin/members/[userId]/page.tsx"),
    read("../components/payments/PortoneCheckoutForm.tsx"),
    read("../components/payments/SubscriptionWaitlistForm.tsx"),
    read("../components/mypage/SubscriptionCancelButton.tsx"),
    read("../components/mypage/RefundRequestButton.tsx"),
    read("../components/personal-color/PersonalColorDiagnosisPageClient.tsx"),
    read("../components/result/ActionToolbar.tsx"),
    read("../components/result/FeedbackModal.tsx"),
    read("../components/styler/useStylerNewController.ts"),
    read("../components/styler/useStylerSessionController.ts"),
    read("../components/workspace/useCustomerGenerationController.ts"),
    read("../../apps/hairfit-app/app/account.tsx"),
    read("../../apps/hairfit-app/app/index.tsx"),
    read("../../apps/hairfit-app/app/mypage.tsx"),
    read("../../apps/hairfit-app/app/sso-callback.tsx"),
    read("../../apps/hairfit-app/app/admin/index.tsx"),
    read("../../apps/hairfit-app/app/admin/stats.tsx"),
    read("../../apps/hairfit-app/app/generate/[id].tsx"),
    read("../../apps/hairfit-app/app/result/[id].tsx"),
    read("../../apps/hairfit-app/app/salon/index.tsx"),
    read("../../apps/hairfit-app/app/salon/connections.tsx"),
    read("../../apps/hairfit-app/app/salon/customers/[id].tsx"),
    read("../../apps/hairfit-app/app/salon/match/[code].tsx"),
    read("../../apps/hairfit-app/components/mypage/panels/MobileMyPageAccountPanel.tsx"),
    read("../../apps/hairfit-app/components/mypage/panels/MobileMyPageBodyProfilePanel.tsx"),
    read("../../apps/hairfit-app/components/mypage/panels/MobileMyPagePersonalColorPanel.tsx"),
  ];

  for (const source of sources) {
    assert.doesNotMatch(source, /set(?:Error|Message|LoadError|ExportError)\([^\n]*\.message/);
    assert.doesNotMatch(source, /instanceof Error\s*\?\s*[^:\n]*\.message/);
  }
});

test("non-aftercare response failures use owned task copy instead of API error payloads", () => {
  const responseSafeSources = [
    read("../app/admin/members/page.tsx"),
    read("../app/admin/members/[userId]/page.tsx"),
    read("../app/admin/refunds/page.tsx"),
    read("../app/admin/stats/page.tsx"),
    read("../app/admin/subscription-waitlist/page.tsx"),
    read("../app/admin/support/page.tsx"),
    read("../app/result/[id]/page.tsx"),
    read("../components/home/B2BLeadForm.tsx"),
    read("../components/mypage/MemberGenderForm.tsx"),
    read("../components/mypage/StyleProfileForm.tsx"),
    read("../components/salon/CustomerListClient.tsx"),
    read("../components/salon/MatchInviteClient.tsx"),
    read("../components/salon/SalonConnectionsClient.tsx"),
    read("../components/salon/useSalonGenerationController.ts"),
    read("../components/styler/useStylerNewController.ts"),
    read("../components/styler/useStylerSessionController.ts"),
    read("../components/support/SupportPostForm.tsx"),
    read("../components/support/SupportPostOwnerActions.tsx"),
  ];

  for (const source of responseSafeSources) {
    assert.doesNotMatch(
      source,
      /set(?:Error|Message|LoadError|QuoteError|ExportError)\([^\n]*(?:data|payload|result|response)\??\.error/,
    );
  }

  assert.doesNotMatch(read("../app/result/[id]/page.tsx"), /payload\?\.error/);

  const mixedCustomerDetail = read("../components/salon/CustomerDetailClient.tsx");
  assert.doesNotMatch(mixedCustomerDetail, /setError\(data\.error \|\| "고객 정보/);
  assert.doesNotMatch(mixedCustomerDetail, /setError\(data\.error \|\| "방문 기록/);
  assert.doesNotMatch(mixedCustomerDetail, /setError\(data\.error \|\| "회원 연결/);
});

test("mapped errors and status changes are announced on web and native surfaces", () => {
  const webAlertSources = [
    read("../app/admin/members/page.tsx"),
    read("../app/admin/members/[userId]/page.tsx"),
    read("../app/admin/refunds/page.tsx"),
    read("../app/admin/stats/page.tsx"),
    read("../app/admin/subscription-waitlist/page.tsx"),
    read("../app/admin/support/page.tsx"),
    read("../components/home/B2BLeadForm.tsx"),
    read("../components/mypage/MemberGenderForm.tsx"),
    read("../components/mypage/StyleProfileForm.tsx"),
    read("../components/salon/CustomerListClient.tsx"),
    read("../components/salon/MatchInviteClient.tsx"),
    read("../components/salon/SalonWorkspaceWizard.tsx"),
    read("../components/support/SupportPostForm.tsx"),
    read("../components/support/SupportPostOwnerActions.tsx"),
  ];
  for (const source of webAlertSources) {
    assert.match(source, /role="alert"/);
  }

  const nativeLiveSources = [
    read("../../apps/hairfit-app/app/account.tsx"),
    read("../../apps/hairfit-app/app/admin/b2b.tsx"),
    read("../../apps/hairfit-app/app/admin/inbox.tsx"),
    read("../../apps/hairfit-app/app/admin/members.tsx"),
    read("../../apps/hairfit-app/app/admin/members/[userId].tsx"),
    read("../../apps/hairfit-app/app/admin/reviews.tsx"),
    read("../../apps/hairfit-app/app/admin/stats.tsx"),
    read("../../apps/hairfit-app/app/generate/[id].tsx"),
    read("../../apps/hairfit-app/app/mypage.tsx"),
    read("../../apps/hairfit-app/app/salon/customers/[id].tsx"),
    read("../../apps/hairfit-app/app/salon/customers/index.tsx"),
  ];
  for (const source of nativeLiveSources) {
    assert.match(source, /accessibilityLiveRegion="assertive"/);
    assert.match(source, /accessibilityRole="alert"/);
  }

  const politeStatusSources = [
    read("../app/admin/support/page.tsx"),
    read("../components/salon/SalonWorkspaceWizard.tsx"),
  ];
  for (const source of politeStatusSources) {
    assert.match(source, /role="status"/);
    assert.match(source, /aria-live="polite"/);
  }

  for (const source of [
    read("../app/admin/members/page.tsx"),
    read("../app/admin/refunds/page.tsx"),
  ]) {
    assert.match(source, /role=\{actionNotice\.outcome[\s\S]*?"alert"\s*:\s*"status"\}/);
    assert.match(source, /aria-live=\{actionNotice\.outcome[\s\S]*?"assertive"\s*:\s*"polite"\}/);
  }

  const b2bLeadForm = read("../components/home/B2BLeadForm.tsx");
  const b2bContactPage = read("../app/b2b/contact/page.tsx");
  const formField = read("../components/ui/FormField.tsx");
  assert.match(b2bLeadForm, /<FormField label="관심 플랜">[\s\S]*?<select[\s\S]*?{\.\.\.controlProps}/);
  assert.match(b2bLeadForm, /<FormField label="도입 희망 시점">[\s\S]*?<select[\s\S]*?{\.\.\.controlProps}/);
  assert.match(b2bLeadForm, /<FormField label="예산 범위"[\s\S]*?<select[\s\S]*?{\.\.\.controlProps}/);
  assert.match(formField, /<label[^>]*htmlFor={controlId}>/);
  assert.match(formField, /id: controlId/);
  assert.match(formField, /"aria-describedby": describedBy/);
  assert.match(formField, /"aria-invalid": error \? true : undefined/);
  assert.match(b2bLeadForm, /className="min-w-0 p-4"/);
  assert.match(b2bContactPage, /<header className="min-w-0 space-y-4">/);
});
