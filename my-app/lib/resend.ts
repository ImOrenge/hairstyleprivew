import { Resend } from "resend";
import { getSiteUrl } from "./site-url";

type SendEmailResult = {
  data: { id?: string } | null;
  error: unknown;
};

type PaymentSuccessEmailInput = {
  to: string;
  creditsGranted: number;
  currentCredits?: number | null;
  amount?: number | null;
  currency?: string | null;
  plan?: string | null;
  myPageUrl: string;
  paymentTransactionId: string;
};

type WelcomeEmailAccountType = "member" | "salon_owner";

type WelcomeEmailInput = {
  to: string;
  displayName?: string | null;
  accountType: WelcomeEmailAccountType;
};

const env = process.env as Record<string, string | undefined>;
const resendApiKey = env.RESEND_API_KEY?.trim();
const defaultFromEmail = env.RESEND_FROM_EMAIL?.trim() || "HairStyle <onboarding@resend.dev>";

let resendClient: Resend | null = null;

function getResendClient() {
  if (!resendApiKey) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(resendApiKey);
  }

  return resendClient;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("ko-KR")} ${currency}`;
  }
}

function formatPlanLabel(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "Custom";
  }
  if (normalized === "starter") {
    return "Starter";
  }
  if (normalized === "pro") {
    return "Pro";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildPaymentSuccessEmailHtml(input: PaymentSuccessEmailInput) {
  const amountLine =
    typeof input.amount === "number" && input.amount > 0
      ? `<li><strong>결제 금액:</strong> ${escapeHtml(
          formatMoney(input.amount, (input.currency || "KRW").toUpperCase()),
        )}</li>`
      : "";
  const currentCreditLine =
    typeof input.currentCredits === "number"
      ? `<li><strong>현재 크레딧:</strong> ${escapeHtml(input.currentCredits.toLocaleString("ko-KR"))}</li>`
      : "";
  const planLabel = formatPlanLabel(input.plan);

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
    <h2 style="margin:0 0 12px">결제가 완료되었습니다</h2>
    <p style="margin:0 0 14px">HairFit 크레딧이 정상적으로 충전되었습니다.</p>
    <ul style="padding-left:18px;margin:0 0 16px">
      <li><strong>플랜:</strong> ${escapeHtml(planLabel)}</li>
      ${amountLine}
      <li><strong>충전 크레딧:</strong> +${escapeHtml(input.creditsGranted.toLocaleString("ko-KR"))}</li>
      ${currentCreditLine}
      <li><strong>결제 ID:</strong> ${escapeHtml(input.paymentTransactionId)}</li>
    </ul>
    <a href="${escapeHtml(input.myPageUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px">
      마이페이지 열기
    </a>
  </div>
  `;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = defaultFromEmail,
}: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}): Promise<SendEmailResult> {
  if (!resendApiKey) {
    console.warn(`[Resend] Skipping email send to ${to} (missing RESEND_API_KEY)`);
    return { data: null, error: new Error("Missing RESEND_API_KEY") };
  }

  try {
    const client = getResendClient();
    if (!client) {
      return { data: null, error: new Error("Missing RESEND_API_KEY") };
    }

    const { data, error } = await client.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });

    if (error) {
      console.error("[Resend] Email send failed:", error);
      return { data, error };
    }

    return { data: data ?? null, error: null };
  } catch (error) {
    console.error("[Resend] Unexpected email send error:", error);
    return { data: null, error };
  }
}

export async function sendPaymentSuccessEmail(input: PaymentSuccessEmailInput) {
  const subject = `[HairFit] 결제가 완료되었어요 (+${input.creditsGranted.toLocaleString("ko-KR")} credits)`;
  const html = buildPaymentSuccessEmailHtml(input);
  return sendEmail({ to: input.to, subject, html });
}

// ─── 구독 갱신 이메일 ────────────────────────────────────────────────────────

function buildAbsoluteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString();
}

function getWelcomeEmailRoleCopy(accountType: WelcomeEmailAccountType) {
  if (accountType === "salon_owner") {
    return {
      roleLabel: "헤어샵 운영자",
      ctaLabel: "운영자 홈으로 이동",
      ctaUrl: buildAbsoluteUrl("/salon"),
      guideItems: [
        "샵 기본 정보와 고객 흐름을 확인해 주세요.",
        "고객 매칭과 상담 기록을 운영자 화면에서 관리할 수 있습니다.",
        "새로운 문의와 메일함은 관리자/운영자 메뉴에서 확인할 수 있습니다.",
      ],
    };
  }

  return {
    roleLabel: "일반 회원",
    ctaLabel: "HairStyle 홈으로 이동",
    ctaUrl: buildAbsoluteUrl("/home"),
    guideItems: [
      "홈에서 최근 스타일 추천과 진행 상태를 확인할 수 있습니다.",
      "얼굴 사진을 업로드하면 헤어 스타일 미리보기를 생성할 수 있습니다.",
      "마이페이지에서 크레딧, 결제 내역, 에프터케어 알림을 확인할 수 있습니다.",
    ],
  };
}

function buildWelcomeEmailHtml(input: WelcomeEmailInput) {
  const roleCopy = getWelcomeEmailRoleCopy(input.accountType);
  const displayName = input.displayName?.trim() || roleCopy.roleLabel;
  const guideItems = roleCopy.guideItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return `
  <div style="margin:0;padding:0;background:#f6f5f1;color:#191816;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
    <div style="max-width:640px;margin:0 auto;padding:32px 18px">
      <div style="border:1px solid #d4cfc4;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 1px 0 rgba(25,24,22,0.08)">
        <div style="padding:28px 26px 22px;border-bottom:1px solid #d4cfc4;background:#fbfaf7">
          <p style="margin:0 0 10px;color:#80621e;font-size:11px;font-weight:900;letter-spacing:0.18em;text-transform:uppercase">Welcome</p>
          <h1 style="margin:0;color:#191816;font-size:26px;line-height:1.3;font-weight:900">HairStyle 가입을 환영합니다</h1>
          <p style="margin:14px 0 0;color:#625f57;font-size:15px;line-height:1.7">${escapeHtml(displayName)}님, HairStyle에 가입해 주셔서 감사합니다.</p>
        </div>

        <div style="padding:26px">
          <h2 style="margin:0 0 12px;color:#191816;font-size:18px;line-height:1.4;font-weight:800">이용 안내</h2>
          <ul style="margin:0 0 22px;padding-left:20px;color:#191816;font-size:14px;line-height:1.8">
            ${guideItems}
          </ul>

          <a href="${escapeHtml(roleCopy.ctaUrl)}" style="display:inline-block;background:#050505;color:#f4f1e8;text-decoration:none;border:1px solid #050505;border-radius:3px;padding:12px 18px;font-size:13px;font-weight:800;letter-spacing:0.04em">
            ${escapeHtml(roleCopy.ctaLabel)}
          </a>

          <div style="margin-top:28px;border-top:1px solid #d4cfc4;padding-top:18px">
            <p style="margin:0;color:#625f57;font-size:12px;line-height:1.7">
              본 메일은 발신 전용 주소에서 발송되었습니다. 이 메일로 회신하셔도 답변을 받을 수 없습니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
  `;
}

function buildWelcomeEmailText(input: WelcomeEmailInput) {
  const roleCopy = getWelcomeEmailRoleCopy(input.accountType);
  const displayName = input.displayName?.trim() || roleCopy.roleLabel;

  return [
    "HairStyle 가입을 환영합니다.",
    "",
    `${displayName}님, HairStyle에 가입해 주셔서 감사합니다.`,
    "",
    "이용 안내",
    ...roleCopy.guideItems.map((item) => `- ${item}`),
    "",
    `${roleCopy.ctaLabel}: ${roleCopy.ctaUrl}`,
    "",
    "본 메일은 발신 전용 주소에서 발송되었습니다. 이 메일로 회신하셔도 답변을 받을 수 없습니다.",
  ].join("\n");
}

export async function sendWelcomeEmail(input: WelcomeEmailInput) {
  const subject = "[HairStyle] 가입을 환영합니다";
  const html = buildWelcomeEmailHtml(input);
  const text = buildWelcomeEmailText(input);
  return sendEmail({ to: input.to, subject, html, text });
}

type SubscriptionRenewalEmailInput = {
  to: string;
  plan: string;
  creditsGranted: number;
  currentCredits?: number | null;
  periodEnd: string;
  myPageUrl: string;
};

function formatPeriodEnd(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function buildSubscriptionRenewalHtml(input: SubscriptionRenewalEmailInput): string {
  const planLabel = formatPlanLabel(input.plan);
  const periodEndStr = formatPeriodEnd(input.periodEnd);
  const currentCreditsLine =
    typeof input.currentCredits === "number"
      ? `<li><strong>현재 크레딧:</strong> ${escapeHtml(input.currentCredits.toLocaleString("ko-KR"))}</li>`
      : "";

  return `
  <div style="font-family:-apple-system,Arial,sans-serif;line-height:1.7;color:#111827;max-width:600px;margin:0 auto">
    <h2 style="font-size:20px;font-weight:700;margin:0 0 12px">✅ 구독이 갱신되었어요</h2>
    <p style="margin:0 0 14px">HairStyle ${escapeHtml(planLabel)} 구독이 자동 갱신되어 크레딧이 충전되었습니다.</p>
    <ul style="padding-left:18px;margin:0 0 16px">
      <li><strong>플랜:</strong> ${escapeHtml(planLabel)}</li>
      <li><strong>충전 크레딧:</strong> +${escapeHtml(input.creditsGranted.toLocaleString("ko-KR"))}</li>
      ${currentCreditsLine}
      <li><strong>다음 갱신일:</strong> ${escapeHtml(periodEndStr)}</li>
    </ul>
    <a href="${escapeHtml(input.myPageUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
      마이페이지에서 확인하기
    </a>
    <p style="margin-top:24px;font-size:12px;color:#9ca3af">
      구독을 해지하려면 마이페이지 &gt; 구독 관리에서 취소하실 수 있습니다.
    </p>
  </div>
  `;
}

export async function sendSubscriptionRenewalEmail(
  input: SubscriptionRenewalEmailInput,
) {
  const subject = `[HairStyle] ${formatPlanLabel(input.plan)} 구독이 갱신되었습니다 (+${input.creditsGranted.toLocaleString("ko-KR")} credits)`;
  const html = buildSubscriptionRenewalHtml(input);
  return sendEmail({ to: input.to, subject, html });
}

// ─── 케어 이메일 발송 ────────────────────────────────────────────────────────

type CareEmailInput = {
  to: string;
  subject: string;
  bodyHtml: string;
};

export async function sendCareEmail(input: CareEmailInput) {
  return sendEmail({
    to: input.to,
    subject: input.subject,
    html: input.bodyHtml,
  });
}
