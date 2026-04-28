import { Resend } from "resend";

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

const env = process.env as Record<string, string | undefined>;
const resendApiKey = env.RESEND_API_KEY?.trim();
const defaultFromEmail = env.RESEND_FROM_EMAIL?.trim() || "HairFit <onboarding@resend.dev>";

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
  from = defaultFromEmail,
}: {
  to: string | string[];
  subject: string;
  html: string;
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
    <p style="margin:0 0 14px">HariStyle ${escapeHtml(planLabel)} 구독이 자동 갱신되어 크레딧이 충전되었습니다.</p>
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
  const subject = `[HariStyle] ${formatPlanLabel(input.plan)} 구독이 갱신되었습니다 (+${input.creditsGranted.toLocaleString("ko-KR")} credits)`;
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
