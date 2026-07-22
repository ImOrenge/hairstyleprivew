import type { GenerationCreditReceipt } from "@hairfit/shared";
import { Resend } from "resend";
import { isAmbiguousResendDeliveryError } from "./resend-delivery-classification";
import { getSiteUrl } from "./site-url";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";

export type SendEmailResult = {
  data: { id?: string } | null;
  error: unknown;
  deliveryUncertain: boolean;
};

export type PreparedEmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  source: string;
  idempotencyKey: string;
};

type OutboundEmailStatus = "sent" | "failed" | "skipped";

type EmailTone = "default" | "success" | "warning" | "danger";

type KeyValueRow = {
  label: string;
  value?: string | number | null;
};

type EmailLayoutInput = {
  kicker: string;
  title: string;
  preview: string;
  body: string[];
  cta?: {
    label: string;
    url: string;
  };
  details?: KeyValueRow[];
  note?: string;
  tone?: EmailTone;
};

type PaymentSuccessEmailInput = {
  to: string;
  displayName?: string | null;
  creditsGranted: number;
  currentCredits?: number | null;
  amount?: number | null;
  currency?: string | null;
  plan?: string | null;
  myPageUrl: string;
  paymentTransactionId: string;
};

type PaymentFailureEmailInput = {
  to: string;
  displayName?: string | null;
  plan?: string | null;
  amount?: number | null;
  currency?: string | null;
  failureMessage?: string | null;
  nextRetryAt?: string | null;
  myPageUrl: string;
  paymentTransactionId?: string | null;
};

type RefundCompletedEmailInput = {
  to: string;
  displayName?: string | null;
  plan?: string | null;
  refundAmount?: number | null;
  currency?: string | null;
  paymentTransactionId?: string | null;
  creditsClawedBack?: number | null;
  creditsUnrecovered?: number | null;
  myPageUrl: string;
};

type RefundReviewEmailInput = {
  to: string;
  displayName?: string | null;
  plan?: string | null;
  requestedAmount?: number | null;
  currency?: string | null;
  paymentTransactionId?: string | null;
  supportUrl: string;
};

type SupportReplyEmailInput = {
  to: string;
  displayName?: string | null;
  postId: string;
  postTitle: string;
  postKindLabel?: string | null;
  postStatusLabel?: string | null;
  adminAnswer: string;
  answeredAt?: string | null;
};

type WelcomeEmailAccountType = "member" | "salon_owner";

type WelcomeEmailInput = {
  to: string;
  displayName?: string | null;
  accountType: WelcomeEmailAccountType;
};

type SubscriptionRenewalEmailInput = {
  to: string;
  displayName?: string | null;
  plan: string;
  amount?: number | null;
  currency?: string | null;
  creditsGranted: number;
  currentCredits?: number | null;
  periodEnd: string;
  myPageUrl: string;
};

type SubscriptionWaitlistConfirmationEmailInput = {
  to: string;
  displayName?: string | null;
  planKey: string;
};

type CareEmailInput = {
  to: string;
  subject: string;
  bodyHtml: string;
};

type RefundStatusEmailInput = {
  to: string;
  displayName?: string | null;
  requestId: string;
  eventType: "submitted" | "manual_review" | "cancel_pending" | "completed" | "failed" | "period_end_scheduled";
  refundAmount?: number | null;
  myPageUrl: string;
};

export type GenerationCompletedEmailInput = {
  to: string;
  displayName?: string | null;
  generationId: string;
  completedCount: number;
  failedCount: number;
  resultUrl: string;
  retryUrl?: string;
  creditReceipt?: GenerationCreditReceipt | null;
};

export type StylingCompletedEmailInput = {
  to: string;
  displayName?: string | null;
  sessionId: string;
  terminalKind: "completed" | "failed";
  resultUrl: string;
  chargedCredits: number;
  refundedCredits: number;
};

const PRODUCTION_FROM_EMAIL = "HairFit <noreply@hairfit.beauty>";
const RESEND_DEVELOPMENT_SENDER_PATTERN = /@resend\.dev\b/i;

function stripDevelopmentSender(value: string) {
  return RESEND_DEVELOPMENT_SENDER_PATTERN.test(value) ? "" : value;
}

function normalizeFromEmail(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  if (/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(trimmed)) {
    return stripDevelopmentSender(trimmed);
  }

  if (/^.+<[^<>\s]+@[^<>\s]+\.[^<>\s]+>$/.test(trimmed)) {
    return stripDevelopmentSender(trimmed);
  }

  const looseMatch = trimmed.match(/^(.+?)\s+([^<>\s]+@[^<>\s]+\.[^<>\s]+)$/);
  if (looseMatch) {
    return stripDevelopmentSender(`${looseMatch[1].trim()} <${looseMatch[2].trim()}>`);
  }

  return stripDevelopmentSender(trimmed);
}

const env = process.env as Record<string, string | undefined>;
const resendApiKey = env.RESEND_API_KEY?.trim();
const defaultFromEmail = normalizeFromEmail(env.RESEND_FROM_EMAIL) || PRODUCTION_FROM_EMAIL;
const MAX_LOGGED_EMAIL_BODY_LENGTH = 500_000;

const EMAIL_COLORS = {
  bg: "#f6f5f1",
  surface: "#ffffff",
  surfaceRaised: "#fbfaf7",
  border: "#d4cfc4",
  text: "#191816",
  muted: "#625f57",
  subtle: "#908a7e",
  inverse: "#050505",
  inverseText: "#f4f1e8",
  accent: "#a8863a",
  accentStrong: "#80621e",
  danger: "#be123c",
  dangerBg: "#fae8eb",
  warning: "#a16207",
  warningBg: "#f8edd2",
  success: "#047857",
  successBg: "#e7f4ed",
} as const;

const toneStyle: Record<EmailTone, { bg: string; color: string; label: string }> = {
  default: {
    bg: EMAIL_COLORS.surfaceRaised,
    color: EMAIL_COLORS.accentStrong,
    label: "HairFit",
  },
  success: {
    bg: EMAIL_COLORS.successBg,
    color: EMAIL_COLORS.success,
    label: "완료",
  },
  warning: {
    bg: EMAIL_COLORS.warningBg,
    color: EMAIL_COLORS.warning,
    label: "확인 필요",
  },
  danger: {
    bg: EMAIL_COLORS.dangerBg,
    color: EMAIL_COLORS.danger,
    label: "처리 안내",
  },
};

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

function formatMoney(amount: number, currency: string = "KRW") {
  const normalizedCurrency = currency.toUpperCase();
  try {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("ko-KR")} ${normalizedCurrency}`;
  }
}

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

function formatPlanLabel(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "사용 중인 플랜";
  }
  if (normalized === "starter") return "스타터";
  if (normalized === "free") return "무료";
  if (normalized === "basic") return "베이직";
  if (normalized === "standard") return "스탠다드";
  if (normalized === "pro") return "프로";
  if (normalized === "salon") return "살롱";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return iso;
    return value.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function summarizeText(value: string, maxLength = 220) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function buildAbsoluteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString();
}

function normalizeRecipients(to: string | string[]) {
  return (Array.isArray(to) ? to : [to]).map((item) => item.trim()).filter(Boolean);
}

function trimEmailBody(value?: string | null) {
  if (!value) return null;
  return value.slice(0, MAX_LOGGED_EMAIL_BODY_LENGTH);
}

function buildEmailPreview(text?: string | null, html?: string | null) {
  const source = text || html?.replace(/<[^>]+>/g, " ") || "";
  return source.replace(/\s+/g, " ").trim().slice(0, 500);
}

function formatEmailLogError(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown email error";
  }
}

function getProviderMessageId(data: unknown) {
  if (typeof data !== "object" || data === null || !("id" in data)) {
    return null;
  }

  const id = (data as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id : null;
}

async function recordOutboundEmail({
  to,
  from,
  subject,
  html,
  text,
  source,
  status,
  providerMessageId,
  error,
}: {
  to: string | string[];
  from: string;
  subject: string;
  html: string;
  text?: string;
  source: string;
  status: OutboundEmailStatus;
  providerMessageId?: string | null;
  error?: unknown;
}) {
  if (!isSupabaseConfigured()) {
    return;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const recipients = normalizeRecipients(to);
    const { error: insertError } = await supabase
      .from("outbound_emails")
      .insert({
        provider: "resend",
        provider_message_id: providerMessageId || null,
        source,
        from_email: from,
        to_emails: recipients,
        to_email_text: recipients.join(", "),
        subject,
        text_body: trimEmailBody(text),
        html_body: trimEmailBody(html),
        body_preview: buildEmailPreview(text, html),
        status,
        error_message: formatEmailLogError(error),
        metadata: {},
        sent_at: status === "sent" ? new Date().toISOString() : null,
      });

    if (insertError) {
      console.warn("[Resend] Failed to record outbound email:", insertError.message);
    }
  } catch (logError) {
    console.warn("[Resend] Unexpected outbound email log failure:", logError);
  }
}

function compactRows(rows: KeyValueRow[] = []) {
  return rows.filter((row) => row.value !== null && row.value !== undefined && String(row.value).trim() !== "");
}

function renderDetails(rows: KeyValueRow[] = []) {
  const visibleRows = compactRows(rows);
  if (visibleRows.length === 0) {
    return "";
  }

  const items = visibleRows
    .map(
      (row) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${EMAIL_COLORS.border};color:${EMAIL_COLORS.muted};font-size:13px;line-height:1.5">${escapeHtml(row.label)}</td>
          <td style="padding:10px 0;border-bottom:1px solid ${EMAIL_COLORS.border};color:${EMAIL_COLORS.text};font-size:13px;line-height:1.5;font-weight:800;text-align:right">${escapeHtml(String(row.value))}</td>
        </tr>`,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border-collapse:collapse">
      <tbody>${items}</tbody>
    </table>`;
}

function renderEmailLayout(input: EmailLayoutInput) {
  const tone = toneStyle[input.tone ?? "default"];
  const body = input.body
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;color:${EMAIL_COLORS.muted};font-size:15px;line-height:1.75">${escapeHtml(paragraph)}</p>`,
    )
    .join("");
  const details = renderDetails(input.details);
  const cta = input.cta
    ? `
      <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;margin-top:4px;background:${EMAIL_COLORS.inverse};color:${EMAIL_COLORS.inverseText};text-decoration:none;border:1px solid ${EMAIL_COLORS.inverse};border-radius:3px;padding:12px 18px;font-size:13px;font-weight:900;letter-spacing:0.04em">
        ${escapeHtml(input.cta.label)}
      </a>`
    : "";
  const note = input.note
    ? `<p style="margin:22px 0 0;color:${EMAIL_COLORS.muted};font-size:12px;line-height:1.7">${escapeHtml(input.note)}</p>`
    : "";

  return `<!doctype html>
  <html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${EMAIL_COLORS.bg};color:${EMAIL_COLORS.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preview)}</div>
  <div style="margin:0;padding:0;background:${EMAIL_COLORS.bg};color:${EMAIL_COLORS.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
    <div style="max-width:640px;margin:0 auto;padding:32px 18px">
      <div style="border:1px solid ${EMAIL_COLORS.border};background:${EMAIL_COLORS.surface};border-radius:6px;overflow:hidden;box-shadow:0 1px 0 rgba(25,24,22,0.08)">
        <div style="padding:28px 26px 22px;border-bottom:1px solid ${EMAIL_COLORS.border};background:${EMAIL_COLORS.surfaceRaised}">
          <p style="margin:0 0 10px;color:${EMAIL_COLORS.accentStrong};font-size:11px;font-weight:900;letter-spacing:0.18em;text-transform:uppercase">${escapeHtml(input.kicker)}</p>
          <h1 style="margin:0;color:${EMAIL_COLORS.text};font-size:26px;line-height:1.3;font-weight:900">${escapeHtml(input.title)}</h1>
        </div>
        <div style="padding:26px">
          <p style="display:inline-block;margin:0 0 16px;border:1px solid ${EMAIL_COLORS.border};border-radius:3px;padding:6px 10px;color:${tone.color};background:${tone.bg};font-size:12px;font-weight:900">${escapeHtml(tone.label)}</p>
          ${body}
          ${details}
          ${cta}
          ${note}
          <div style="margin-top:28px;border-top:1px solid ${EMAIL_COLORS.border};padding-top:18px">
            <p style="margin:0;color:${EMAIL_COLORS.muted};font-size:12px;line-height:1.7">
              본 메일은 HairFit 서비스 이용과 관련해 발송되었습니다.<br />
              문의가 필요하시면 마이페이지 또는 고객지원 메뉴를 이용해 주세요.
            </p>
            <p style="margin:14px 0 0;color:${EMAIL_COLORS.text};font-size:12px;line-height:1.7;font-weight:800">
              HairFit<br />
              <span style="color:${EMAIL_COLORS.muted};font-weight:600">내 스타일을 미리 확인하는 헤어 시뮬레이션 서비스</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
  </body>
  </html>`;
}

function renderText(input: EmailLayoutInput) {
  const lines = [
    `[HairFit] ${input.title}`,
    "",
    input.preview,
    "",
    ...input.body,
  ];
  const details = compactRows(input.details);
  if (details.length > 0) {
    lines.push("", "상세 내역", ...details.map((row) => `- ${row.label}: ${row.value}`));
  }
  if (input.cta) {
    lines.push("", `${input.cta.label}: ${input.cta.url}`);
  }
  if (input.note) {
    lines.push("", input.note);
  }
  lines.push(
    "",
    "본 메일은 HairFit 서비스 이용과 관련해 발송되었습니다.",
    "문의가 필요하시면 마이페이지 또는 고객지원 메뉴를 이용해 주세요.",
    "",
    "HairFit",
    "내 스타일을 미리 확인하는 헤어 시뮬레이션 서비스",
  );
  return lines.join("\n");
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = defaultFromEmail,
  source = "app",
  idempotencyKey,
}: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  source?: string;
  idempotencyKey?: string;
}): Promise<SendEmailResult> {
  const resolvedFrom = normalizeFromEmail(from) || defaultFromEmail;

  if (!resendApiKey) {
    console.warn(`[Resend] Skipping email send to ${to} (missing RESEND_API_KEY)`);
    await recordOutboundEmail({
      to,
      from: resolvedFrom,
      subject,
      html,
      text,
      source,
      status: "skipped",
      error: new Error("Missing RESEND_API_KEY"),
    });
    return {
      data: null,
      error: new Error("Missing RESEND_API_KEY"),
      deliveryUncertain: false,
    };
  }

  try {
    const client = getResendClient();
    if (!client) {
      return {
        data: null,
        error: new Error("Missing RESEND_API_KEY"),
        deliveryUncertain: false,
      };
    }

    const payload = {
      from: resolvedFrom,
      to,
      subject,
      html,
      text,
    };
    const { data, error } = idempotencyKey
      ? await client.emails.send(payload, { idempotencyKey })
      : await client.emails.send(payload);

    if (error) {
      console.error("[Resend] Email send failed:", error);
      await recordOutboundEmail({
        to,
        from: resolvedFrom,
        subject,
        html,
        text,
        source,
        status: "failed",
        providerMessageId: getProviderMessageId(data),
        error,
      });
      return {
        data,
        error,
        deliveryUncertain: isAmbiguousResendDeliveryError(error),
      };
    }

    await recordOutboundEmail({
      to,
      from: resolvedFrom,
      subject,
      html,
      text,
      source,
      status: "sent",
      providerMessageId: getProviderMessageId(data),
    });
    return { data: data ?? null, error: null, deliveryUncertain: false };
  } catch (error) {
    console.error("[Resend] Unexpected email send error:", error);
    await recordOutboundEmail({
      to,
      from: resolvedFrom,
      subject,
      html,
      text,
      source,
      status: "failed",
      error,
    });
    return { data: null, error, deliveryUncertain: true };
  }
}

function sendTemplatedEmail({
  to,
  subject,
  layout,
  source,
  idempotencyKey,
}: {
  to: string;
  subject: string;
  layout: EmailLayoutInput;
  source: string;
  idempotencyKey?: string;
}) {
  return sendEmail({
    to,
    subject,
    html: renderEmailLayout(layout),
    text: renderText(layout),
    source,
    idempotencyKey,
  });
}

function greetingName(displayName?: string | null) {
  return displayName?.trim() || "고객";
}

export function prepareGenerationCompletedEmail(
  input: GenerationCompletedEmailInput,
): PreparedEmailPayload {
  const displayName = greetingName(input.displayName);
  const totalCount = input.completedCount + input.failedCount;
  const allFailed = input.completedCount === 0;
  const hasPartialFailure = input.failedCount > 0;
  const refundedCredits = input.creditReceipt?.state === "refunded"
    ? input.creditReceipt.refundedCredits
    : 0;
  const chargedCredits = input.creditReceipt?.state === "charged"
    ? input.creditReceipt.chargedCredits
    : 0;
  const newGenerationUrl = input.retryUrl || new URL("/generate", input.resultUrl).toString();
  const subject = allFailed
    ? "[HairFit] 헤어스타일 생성 결과를 확인해 주세요"
    : hasPartialFailure
    ? `[HairFit] 헤어스타일 ${input.completedCount}개가 준비되었습니다`
    : "[HairFit] 헤어스타일 생성이 완료되었습니다";

  const layout: EmailLayoutInput = {
      kicker: "HairFit Generation",
      title: allFailed
        ? "헤어스타일을 생성하지 못했습니다"
        : hasPartialFailure
          ? "완성된 헤어스타일을 확인해 주세요"
          : "헤어스타일 생성이 완료되었습니다",
      preview: allFailed
        ? refundedCredits > 0
          ? `요청하신 후보를 생성하지 못해 ${refundedCredits}크레딧을 전액 복구했습니다.`
          : "요청하신 후보를 생성하지 못했습니다. 다시 시도해 주세요."
        : hasPartialFailure
        ? `${totalCount}개 후보 중 ${input.completedCount}개가 준비되었습니다.`
        : `${input.completedCount}개의 헤어스타일 후보가 모두 준비되었습니다.`,
      tone: allFailed ? "danger" : hasPartialFailure ? "warning" : "success",
      body: [
        `${displayName}님, 요청하신 헤어스타일 생성 작업이 종료되었습니다.`,
        allFailed
          ? refundedCredits > 0
            ? `이번 작업에서는 준비된 후보가 없어 예약했던 ${refundedCredits}크레딧을 전액 복구했습니다. HairFit에서 새 생성으로 다시 접수해 주세요.`
            : "이번 작업에서는 준비된 후보가 없습니다. 사진 상태와 크레딧을 확인한 뒤 HairFit에서 다시 시도해 주세요."
          : hasPartialFailure
          ? "일부 후보는 생성에 실패했지만, 준비된 결과는 지금 바로 비교하고 선택할 수 있습니다."
          : "페이지나 앱을 닫은 동안에도 작업을 이어서 완료했습니다. 결과 보드에서 후보를 비교해 보세요.",
      ],
      details: [
        { label: "준비된 후보", value: `${input.completedCount}개` },
        { label: "생성하지 못한 후보", value: input.failedCount > 0 ? `${input.failedCount}개` : null },
        {
          label: refundedCredits > 0 ? "복구 크레딧" : "사용 크레딧",
          value:
            refundedCredits > 0
              ? `${refundedCredits}크레딧 · 복구 완료`
              : chargedCredits > 0
                ? `${chargedCredits}크레딧 · 차감 완료`
                : null,
        },
      ],
      cta: {
        label: allFailed ? "HairFit에서 다시 시도" : "결과 보드 열기",
        url: allFailed ? newGenerationUrl : input.resultUrl,
      },
      note: "보안을 위해 이메일에는 사진을 첨부하지 않았습니다. HairFit에 로그인한 뒤 결과를 확인해 주세요.",
  };

  return {
    to: input.to,
    from: defaultFromEmail,
    subject,
    html: renderEmailLayout(layout),
    text: renderText(layout),
    source: "generation_completed",
    idempotencyKey: `generation-completed/${input.generationId}`,
  };
}

export async function sendGenerationCompletedEmail(input: GenerationCompletedEmailInput) {
  return sendEmail(prepareGenerationCompletedEmail(input));
}

export function prepareStylingCompletedEmail(
  input: StylingCompletedEmailInput,
): PreparedEmailPayload {
  const completed = input.terminalKind === "completed";
  const displayName = greetingName(input.displayName);
  const subject = completed
    ? "[HairFit] 패션 룩북 생성이 완료되었습니다"
    : "[HairFit] 패션 룩북 작업 결과를 확인해 주세요";
  const layout: EmailLayoutInput = {
    kicker: "HairFit Styling",
    title: completed ? "패션 룩북이 준비되었습니다" : "패션 룩북을 생성하지 못했습니다",
    preview: completed
      ? "앱이나 페이지를 닫은 동안에도 백그라운드 작업을 완료했습니다."
      : input.refundedCredits > 0
        ? `${input.refundedCredits}크레딧을 자동 복구했습니다.`
        : "작업 상태와 크레딧 내역을 확인해 주세요.",
    tone: completed ? "success" : "danger",
    body: [
      `${displayName}님, 요청하신 패션 룩북 생성 작업이 종료되었습니다.`,
      completed
        ? "앱이나 페이지를 닫은 뒤에도 서버에서 생성을 이어서 완료했습니다. HairFit에 로그인해 결과 이미지를 확인해 주세요."
        : input.refundedCredits > 0
          ? `이미지를 완성하지 못해 예약했던 ${input.refundedCredits}크레딧을 자동 복구했습니다. 세션 화면에서 상태를 확인한 뒤 다시 접수할 수 있습니다.`
          : "이미지를 완성하지 못했습니다. 세션 화면에서 처리 상태를 확인해 주세요.",
    ],
    details: [
      {
        label: completed ? "사용 크레딧" : "복구 크레딧",
        value: completed && input.chargedCredits > 0
          ? `${input.chargedCredits}크레딧 · 차감 완료`
          : !completed && input.refundedCredits > 0
            ? `${input.refundedCredits}크레딧 · 복구 완료`
            : null,
      },
    ],
    cta: {
      label: completed ? "룩북 결과 열기" : "작업 상태 확인하기",
      url: input.resultUrl,
    },
    note: "보안을 위해 이메일에는 전신 사진과 생성 이미지를 첨부하지 않았습니다. HairFit에 로그인한 뒤 확인해 주세요.",
  };

  return {
    to: input.to,
    from: defaultFromEmail,
    subject,
    html: renderEmailLayout(layout),
    text: renderText(layout),
    source: "styling_completed",
    idempotencyKey: `styling-completed/${input.sessionId}`,
  };
}

function getWelcomeEmailRoleCopy(accountType: WelcomeEmailAccountType) {
  if (accountType === "salon_owner") {
    return {
      subject: "[HairFit] 살롱 워크스페이스가 준비되었습니다",
      preview: "고객별 상담 기록과 스타일 추천 결과를 한곳에서 관리하세요.",
      title: "살롱 워크스페이스가 준비되었습니다",
      intro:
        "HairFit 살롱 계정 생성이 완료되었습니다. 이제 고객 사진, 추천 결과, 방문 기록, 사후관리 내용을 고객별로 정리할 수 있습니다.",
      roleLabel: "헤어샵 운영자",
      sectionTitle: "운영 시작 전 확인할 항목",
      ctaLabel: "살롱 홈 열기",
      ctaUrl: buildAbsoluteUrl("/salon"),
      guideItems: [
        "살롱 홈에서 샵 정보와 고객 관리 화면을 확인해 주세요.",
        "고객 초대 또는 매칭 링크로 상담 대상을 연결해 주세요.",
        "고객이 선택한 헤어 후보를 기준으로 볼륨, 앞머리, 얼굴선 보정 방향을 함께 정리해 보세요.",
      ],
    };
  }

  return {
    subject: "[HairFit] 가입이 완료되었습니다",
    preview: "사진 한 장으로 어울리는 헤어 후보를 확인해 보세요.",
    title: "가입이 완료되었습니다",
    intro:
      "HairFit에 오신 것을 환영합니다. 얼굴형, 두상 밸런스, 스타일 선호도를 바탕으로 어울리는 헤어 후보를 한 화면에서 비교할 수 있습니다.",
    roleLabel: "일반 회원",
    sectionTitle: "시작 전 확인할 항목",
    ctaLabel: "헤어 추천 시작하기",
    ctaUrl: buildAbsoluteUrl("/home"),
    guideItems: [
      "프로필에서 성별과 원하는 스타일 분위기를 입력해 주세요.",
      "얼굴이 잘 보이는 정면 사진을 준비해 주세요.",
      "3x3 추천 보드에서 짧은 머리, 중간 길이, 긴 머리 후보를 비교해 보세요.",
    ],
  };
}

export async function sendWelcomeEmail(input: WelcomeEmailInput) {
  const roleCopy = getWelcomeEmailRoleCopy(input.accountType);
  const displayName = greetingName(input.displayName);
  return sendTemplatedEmail({
    to: input.to,
    subject: roleCopy.subject,
    source: input.accountType === "salon_owner" ? "welcome_salon" : "welcome_member",
    layout: {
      kicker: "Welcome to HairFit",
      title: roleCopy.title,
      preview: roleCopy.preview,
      tone: "success",
      body: [
        `${displayName}님, ${roleCopy.intro}`,
        `${roleCopy.sectionTitle}: ${roleCopy.guideItems.join(" ")}`,
        input.accountType === "salon_owner"
          ? "문의와 사후관리 태스크는 운영 화면에서 이어서 확인할 수 있습니다."
          : "생성한 결과는 마이페이지에서 다시 확인할 수 있고, 미용실 상담 이미지로도 활용할 수 있습니다.",
      ],
      cta: {
        label: roleCopy.ctaLabel,
        url: roleCopy.ctaUrl,
      },
      details: roleCopy.guideItems.map((item, index) => ({
        label: `${index + 1}`,
        value: item,
      })),
      note: `${roleCopy.roleLabel} 계정 기준으로 안내드립니다.`,
    },
  });
}

export async function sendPaymentSuccessEmail(input: PaymentSuccessEmailInput) {
  const planLabel = formatPlanLabel(input.plan);
  const amountText =
    typeof input.amount === "number" && input.amount > 0
      ? formatMoney(input.amount, input.currency || "KRW")
      : null;

  return sendTemplatedEmail({
    to: input.to,
    subject: "[HairFit] 결제가 완료되었습니다",
    source: "payment_success",
    layout: {
      kicker: "Payment complete",
      title: "결제가 완료되었습니다",
      preview: `${planLabel} 플랜 크레딧이 충전되었습니다.`,
      tone: "success",
      body: [
        `${greetingName(input.displayName)}님, ${planLabel} 플랜 결제가 정상적으로 완료되었습니다.`,
        "지금부터 충전된 크레딧으로 헤어 추천과 스타일 결과를 계속 이용할 수 있습니다.",
        "결제 내역과 구독 상태는 마이페이지의 플랜/결제 탭에서 확인할 수 있습니다.",
      ],
      details: [
        { label: "플랜", value: planLabel },
        { label: "결제 금액", value: amountText },
        { label: "충전 크레딧", value: `${formatNumber(input.creditsGranted)} 크레딧` },
        {
          label: "현재 크레딧",
          value:
            typeof input.currentCredits === "number"
              ? `${formatNumber(input.currentCredits)} 크레딧`
              : null,
        },
        { label: "결제 번호", value: input.paymentTransactionId },
      ],
      cta: {
        label: "마이페이지에서 확인하기",
        url: input.myPageUrl,
      },
    },
  });
}

export async function sendPaymentFailureEmail(input: PaymentFailureEmailInput) {
  const planLabel = formatPlanLabel(input.plan);
  const amountText =
    typeof input.amount === "number" && input.amount > 0
      ? formatMoney(input.amount, input.currency || "KRW")
      : null;

  return sendTemplatedEmail({
    to: input.to,
    subject: "[HairFit] 구독 결제를 완료하지 못했습니다",
    source: "payment_failure",
    layout: {
      kicker: "Payment needs attention",
      title: "구독 결제를 완료하지 못했습니다",
      preview: "카드 상태를 확인하면 구독을 계속 이용할 수 있습니다.",
      tone: "warning",
      body: [
        `${greetingName(input.displayName)}님, ${planLabel} 구독 결제가 승인되지 않았습니다.`,
        "카드 한도, 유효기간, 잔액 또는 결제사 승인 상태를 확인해 주세요.",
        "결제가 정상 처리되면 구독 상태와 크레딧이 자동으로 갱신됩니다.",
      ],
      details: [
        { label: "플랜", value: planLabel },
        { label: "결제 금액", value: amountText },
        { label: "실패 사유", value: input.failureMessage || "카드 승인 실패 또는 결제사 상태 확인 필요" },
        { label: "다음 재시도 예정일", value: formatDate(input.nextRetryAt) },
        { label: "결제 번호", value: input.paymentTransactionId },
      ],
      cta: {
        label: "결제 상태 확인하기",
        url: input.myPageUrl,
      },
      note: "재시도 전까지 일부 유료 기능 이용이 제한될 수 있습니다.",
    },
  });
}

export async function sendRefundCompletedEmail(input: RefundCompletedEmailInput) {
  const planLabel = formatPlanLabel(input.plan);
  const amountText =
    typeof input.refundAmount === "number" && input.refundAmount > 0
      ? formatMoney(input.refundAmount, input.currency || "KRW")
      : null;

  return sendTemplatedEmail({
    to: input.to,
    subject: "[HairFit] 환불 처리가 완료되었습니다",
    source: "refund_completed",
    layout: {
      kicker: "Refund complete",
      title: "환불 처리가 완료되었습니다",
      preview: "결제 취소와 크레딧 회수 내역을 확인해 주세요.",
      tone: "danger",
      body: [
        `${greetingName(input.displayName)}님, 요청하신 결제의 환불 처리가 완료되었습니다.`,
        "환불 완료 후 해당 결제로 지급된 크레딧은 정책에 따라 회수됩니다.",
        "이미 사용된 크레딧이 있는 경우 일부 크레딧은 즉시 회수되지 않을 수 있으며, 해당 내역은 운영 검토 대상으로 기록됩니다.",
      ],
      details: [
        { label: "플랜", value: planLabel },
        { label: "환불 금액", value: amountText },
        { label: "결제 번호", value: input.paymentTransactionId },
        {
          label: "회수된 크레딧",
          value:
            typeof input.creditsClawedBack === "number"
              ? `${formatNumber(input.creditsClawedBack)} 크레딧`
              : null,
        },
        {
          label: "미회수 크레딧",
          value:
            typeof input.creditsUnrecovered === "number"
              ? `${formatNumber(input.creditsUnrecovered)} 크레딧`
              : null,
        },
      ],
      cta: {
        label: "환불 내역 확인하기",
        url: input.myPageUrl,
      },
    },
  });
}

export async function sendRefundReviewEmail(input: RefundReviewEmailInput) {
  const planLabel = formatPlanLabel(input.plan);
  const amountText =
    typeof input.requestedAmount === "number" && input.requestedAmount > 0
      ? formatMoney(input.requestedAmount, input.currency || "KRW")
      : null;

  return sendTemplatedEmail({
    to: input.to,
    subject: "[HairFit] 환불 요청을 검토 중입니다",
    source: "refund_review",
    layout: {
      kicker: "Refund review",
      title: "환불 요청을 검토 중입니다",
      preview: "부분 환불은 크레딧 조정 확인 후 처리됩니다.",
      tone: "warning",
      body: [
        `${greetingName(input.displayName)}님, 부분 환불 또는 추가 확인이 필요한 결제 건이 접수되었습니다.`,
        "부분 환불은 결제 금액, 사용한 크레딧, 구독 상태를 함께 확인한 뒤 처리됩니다.",
        "검토가 완료되면 환불 결과를 다시 안내해 드리겠습니다.",
      ],
      details: [
        { label: "플랜", value: planLabel },
        { label: "요청 금액", value: amountText },
        { label: "결제 번호", value: input.paymentTransactionId },
        { label: "접수 상태", value: "운영 검토 중" },
      ],
      cta: {
        label: "고객지원 확인하기",
        url: input.supportUrl,
      },
      note: "긴급한 확인이 필요하면 고객지원으로 문의해 주세요.",
    },
  });
}

export async function sendRefundStatusEmail(input: RefundStatusEmailInput) {
  const content = {
    submitted: ["환불 요청이 접수되었습니다", "자동 처리 가능 여부를 확인하고 있습니다.", "Request received", "default"],
    manual_review: ["환불 요청을 검토 중입니다", "안전한 처리를 위해 담당자가 결제와 이용 내역을 확인합니다.", "Manual review", "warning"],
    cancel_pending: ["결제 취소가 접수되었습니다", "결제사에서 최종 취소 상태를 확인하고 있습니다.", "Cancellation pending", "warning"],
    completed: ["환불 처리가 완료되었습니다", "결제 취소와 구독 종료 처리가 완료되었습니다.", "Refund complete", "success"],
    failed: ["환불 자동 처리를 완료하지 못했습니다", "담당자가 이어서 확인할 수 있도록 요청을 보존했습니다.", "Action required", "danger"],
    period_end_scheduled: ["다음 정기결제가 중단되었습니다", "현재 이용기간과 크레딧은 종료일까지 그대로 유지됩니다.", "Renewal stopped", "success"],
  } as const;
  const [title, description, kicker, tone] = content[input.eventType];
  const amountText = typeof input.refundAmount === "number"
    ? formatMoney(input.refundAmount, "KRW")
    : null;
  return sendTemplatedEmail({
    to: input.to,
    subject: `[HairFit] ${title}`,
    source: `refund_${input.eventType}`,
    idempotencyKey: `refund/${input.requestId}/${input.eventType}`,
    layout: {
      kicker,
      title,
      preview: description,
      tone,
      body: [`${greetingName(input.displayName)}님, ${description}`],
      details: [
        { label: "요청 번호", value: input.requestId },
        { label: "환불 금액", value: amountText },
      ],
      cta: { label: "환불 상태 확인하기", url: input.myPageUrl },
      note: "페이지나 앱을 닫아도 같은 요청 번호로 처리 상태를 다시 확인할 수 있습니다.",
    },
  });
}

export async function sendSupportReplyEmail(input: SupportReplyEmailInput) {
  const supportPostUrl = buildAbsoluteUrl(`/support/posts/${encodeURIComponent(input.postId)}`);
  const answerSummary = summarizeText(input.adminAnswer);

  return sendTemplatedEmail({
    to: input.to,
    subject: "[HairFit] 고객지원 답변이 등록되었습니다",
    source: "support_reply",
    layout: {
      kicker: "Support reply",
      title: "고객지원 답변이 등록되었습니다",
      preview: `${input.postTitle}에 대한 HairFit 운영팀 답변을 확인해 주세요.`,
      tone: "success",
      body: [
        `${greetingName(input.displayName)}님, 남겨주신 고객지원 게시글에 HairFit 운영팀 답변이 등록되었습니다.`,
        `"${input.postTitle}" 글에서 전체 답변과 현재 처리 상태를 확인할 수 있습니다.`,
        `답변 요약: ${answerSummary}`,
      ],
      details: [
        { label: "게시글", value: input.postTitle },
        { label: "게시판", value: input.postKindLabel },
        { label: "상태", value: input.postStatusLabel },
        { label: "답변 등록일", value: formatDate(input.answeredAt) },
      ],
      cta: {
        label: "답변 확인하기",
        url: supportPostUrl,
      },
      note: "추가 확인이 필요하면 고객지원 게시글을 다시 확인한 뒤 필요한 내용을 새 글로 남겨 주세요.",
    },
  });
}

export async function sendSubscriptionRenewalEmail(input: SubscriptionRenewalEmailInput) {
  const planLabel = formatPlanLabel(input.plan);
  const renewalBrandLine = `HairFit ${escapeHtml(planLabel)} 구독이 자동 갱신되어 크레딧이 충전되었습니다.`;
  const subject = `[HairFit] ${formatPlanLabel(input.plan)} 구독이 갱신되었습니다`;
  const amountText =
    typeof input.amount === "number" && input.amount > 0
      ? formatMoney(input.amount, input.currency || "KRW")
      : null;

  return sendTemplatedEmail({
    to: input.to,
    subject,
    source: "subscription_renewal",
    layout: {
      kicker: "Subscription renewed",
      title: "구독이 갱신되었습니다",
      preview: "이번 달 크레딧이 새로 충전되었습니다.",
      tone: "success",
      body: [
        `${greetingName(input.displayName)}님, ${planLabel} 월 구독이 정상적으로 갱신되었습니다.`,
        renewalBrandLine,
        "구독 해지는 마이페이지의 플랜/결제 탭에서 관리할 수 있습니다.",
      ],
      details: [
        { label: "플랜", value: planLabel },
        { label: "결제 금액", value: amountText },
        { label: "충전 크레딧", value: `${formatNumber(input.creditsGranted)} 크레딧` },
        {
          label: "현재 크레딧",
          value:
            typeof input.currentCredits === "number"
              ? `${formatNumber(input.currentCredits)} 크레딧`
              : null,
        },
        { label: "다음 갱신 예정일", value: formatDate(input.periodEnd) },
      ],
      cta: {
        label: "구독 상태 확인하기",
        url: input.myPageUrl,
      },
    },
  });
}

export async function sendSubscriptionWaitlistConfirmationEmail(input: SubscriptionWaitlistConfirmationEmailInput) {
  const planLabel = formatPlanLabel(input.planKey);

  return sendTemplatedEmail({
    to: input.to,
    subject: "[HairFit] 구독 오픈 알림 신청이 완료되었습니다",
    source: "subscription_waitlist",
    layout: {
      kicker: "Subscription waitlist",
      title: "구독 오픈 알림 신청이 완료되었습니다",
      preview: `${planLabel} 플랜 결제 오픈 시 우선 안내드리겠습니다.`,
      tone: "success",
      body: [
        `${greetingName(input.displayName)}님, ${planLabel} 플랜 웨잇리스트 신청이 접수되었습니다.`,
        "현재 PG 연동 준비로 구독 결제는 잠시 대기 중입니다.",
        "결제 오픈이 준비되면 입력하신 이메일로 우선 안내드리겠습니다.",
      ],
      details: [
        { label: "희망 플랜", value: planLabel },
        { label: "상태", value: "오픈 알림 대기" },
      ],
      note: "무료 체험과 기존 생성 기능은 가능한 범위에서 계속 이용할 수 있습니다.",
    },
  });
}

export async function sendCareEmail(input: CareEmailInput) {
  return sendEmail({
    to: input.to,
    subject: input.subject,
    html: input.bodyHtml,
    source: "care",
  });
}
