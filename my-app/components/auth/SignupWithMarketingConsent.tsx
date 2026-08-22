"use client";

import { SignUp } from "@clerk/nextjs";
import { useState } from "react";
import { MARKETING_CONSENT_POLICY_VERSION } from "../../lib/email-campaign";

const clerkAppearance = {
  variables: {
    colorBackground: "var(--app-surface)",
    colorText: "var(--app-text)",
    colorTextSecondary: "var(--app-muted)",
    colorPrimary: "var(--app-accent)",
    colorInputBackground: "var(--app-surface-muted)",
    colorInputText: "var(--app-text)",
    borderRadius: "0.1875rem",
  },
  elements: {
    cardBox: "border border-[var(--app-border)] bg-[var(--app-surface)] shadow-none",
    headerTitle: "text-[var(--app-text)]",
    headerSubtitle: "text-[var(--app-muted)]",
    formButtonPrimary: "bg-[var(--app-inverse)] text-[var(--app-inverse-text)] hover:bg-[var(--app-inverse-muted)]",
    formFieldInput: "border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text)]",
    footerActionLink: "text-[var(--app-accent)]",
  },
} as const;

export function SignupWithMarketingConsent() {
  const [marketingConsent, setMarketingConsent] = useState(false);

  return (
    <div className="w-full space-y-3">
      <div className="border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-[var(--app-text)]">
          <input
            type="checkbox"
            checked={marketingConsent}
            onChange={(event) => setMarketingConsent(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--app-accent)]"
          />
          <span>
            <strong className="block">혜택·프로모션 이메일 수신 동의 (선택)</strong>
            출시 혜택과 스타일 컨설팅 소식을 이메일로 받습니다. 동의하지 않아도 가입과 서비스 이용에는 영향이 없으며, 마이페이지에서 언제든 철회할 수 있습니다.
          </span>
        </label>
      </div>
      <SignUp
        path="/signup"
        signInUrl="/login"
        oauthFlow="redirect"
        fallbackRedirectUrl="/home"
        appearance={clerkAppearance}
        unsafeMetadata={{
          marketingEmailConsent: marketingConsent,
          marketingEmailConsentPolicy: MARKETING_CONSENT_POLICY_VERSION,
        }}
      />
    </div>
  );
}
