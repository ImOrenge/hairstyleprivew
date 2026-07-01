/**
 * cron-subscription-renewal
 * 매일 02:00 KST(17:00 UTC 전날) 실행
 * get_subscriptions_due_for_renewal()로 갱신 대상을 조회하여 PortOne 빌링키 결제 후
 * 성공 시 advance_subscription_period + 크레딧 지급, 실패 시 past_due 처리합니다.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTONE_V2_API_SECRET = Deno.env.get("PORTONE_V2_API_SECRET")!;
const PORTONE_V2_STORE_ID =
  Deno.env.get("PORTONE_V2_STORE_ID")?.trim() ||
  Deno.env.get("NEXT_PUBLIC_PORTONE_V2_STORE_ID")?.trim() ||
  "";
const PORTONE_V2_CHANNEL_KEY =
  Deno.env.get("PORTONE_V2_CHANNEL_KEY")?.trim() ||
  Deno.env.get("NEXT_PUBLIC_PORTONE_V2_CHANNEL_KEY")?.trim() ||
  "";
const BILLING_KEY_ENCRYPTION_SECRET =
  Deno.env.get("BILLING_KEY_ENCRYPTION_SECRET")?.trim() ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ?? "HairFit <onboarding@resend.dev>";
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://haristyle.app";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveBillingKeyEncryptionKey() {
  if (!BILLING_KEY_ENCRYPTION_SECRET) {
    throw new Error("Missing BILLING_KEY_ENCRYPTION_SECRET");
  }

  const secretHash = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(BILLING_KEY_ENCRYPTION_SECRET),
  );
  return crypto.subtle.importKey(
    "raw",
    secretHash,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
}

async function decryptEncryptedBillingKey(encryptedBillingKey: string) {
  const [version, ivBase64, encryptedBase64] = encryptedBillingKey.split(".");
  if (version !== "v1" || !ivBase64 || !encryptedBase64) {
    throw new Error("Unsupported encrypted billing key format");
  }

  const key = await deriveBillingKeyEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivBase64) },
    key,
    base64ToBytes(encryptedBase64),
  );

  return textDecoder.decode(decrypted);
}

// ─── PortOne V2 래퍼 ────────────────────────────────────────────────────────

interface BillingKeyChargeResult {
  status: string;
  paidAt: string | null;
  pgTxId: string | null;
  orderName: string | null;
  amountTotal: number | null;
  currency: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

function parsePaymentResult(data: Record<string, unknown>): BillingKeyChargeResult {
  const payment = data.payment;
  const paymentData =
    typeof payment === "object" && payment !== null && !Array.isArray(payment)
      ? (payment as Record<string, unknown>)
      : data;
  const amount = paymentData.amount as Record<string, unknown> | undefined;
  const pgTxId =
    typeof paymentData.latestPgTxId === "string"
      ? paymentData.latestPgTxId
      : typeof paymentData.pgTxId === "string"
        ? paymentData.pgTxId
        : null;
  const paidAt = typeof paymentData.paidAt === "string" ? paymentData.paidAt : null;
  const status =
    typeof paymentData.status === "string"
      ? paymentData.status
      : pgTxId || paidAt
        ? "PAID"
        : "FAILED";

  return {
    status,
    paidAt,
    pgTxId,
    orderName: typeof paymentData.orderName === "string" ? paymentData.orderName : null,
    amountTotal:
      typeof amount?.total === "number"
        ? amount.total
        : typeof paymentData.totalAmount === "number"
          ? paymentData.totalAmount
          : null,
    currency:
      typeof amount?.currency === "string"
        ? amount.currency
        : typeof paymentData.currency === "string"
          ? paymentData.currency
          : null,
    failureCode: typeof paymentData.failureCode === "string" ? paymentData.failureCode : null,
    failureMessage:
      typeof paymentData.failureMessage === "string" ? paymentData.failureMessage : null,
  };
}

async function chargeBillingKey(
  paymentId: string,
  billingKey: string,
  orderName: string,
  customerId: string,
  amountKrw: number,
): Promise<BillingKeyChargeResult> {
  if (!PORTONE_V2_STORE_ID) {
    throw new Error("Missing PORTONE_V2_STORE_ID");
  }

  const url = `https://api.portone.io/payments/${encodeURIComponent(paymentId)}/billing-key`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `PortOne ${PORTONE_V2_API_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      storeId: PORTONE_V2_STORE_ID,
      billingKey,
      ...(PORTONE_V2_CHANNEL_KEY ? { channelKey: PORTONE_V2_CHANNEL_KEY } : {}),
      orderName,
      customer: { id: customerId },
      amount: { total: amountKrw },
      currency: "KRW",
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const msg = typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
    throw new Error(`PortOne charge failed: ${msg}`);
  }

  return parsePaymentResult(data);
}

async function getPayment(paymentId: string): Promise<BillingKeyChargeResult | null> {
  const url = `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `PortOne ${PORTONE_V2_API_SECRET}`,
    },
  });

  if (res.status === 404) return null;

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data.message === "string" ? data.message : `HTTP ${res.status}`;
    throw new Error(`PortOne payment lookup failed: ${msg}`);
  }

  return parsePaymentResult(data);
}

// ─── Resend 이메일 ──────────────────────────────────────────────────────────

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendRenewalEmail(
  to: string,
  displayName: string | null,
  plan: string,
  amountKrw: number,
  creditsGranted: number,
  nextPeriodEnd: Date,
): Promise<void> {
  if (!RESEND_API_KEY) return;

  const planLabel =
    plan === "basic"
      ? "베이직"
      : plan === "standard"
        ? "스탠다드"
        : plan === "pro"
          ? "프로"
          : plan === "salon"
            ? "살롱"
            : plan.charAt(0).toUpperCase() + plan.slice(1);
  const customerName = displayName?.trim() || "고객";
  const amountText = new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amountKrw);
  const periodEndStr = nextPeriodEnd.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const html = `
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">이번 달 크레딧이 새로 충전되었습니다.</div>
  <div style="margin:0;padding:0;background:#f6f5f1;color:#191816;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
    <div style="max-width:640px;margin:0 auto;padding:32px 18px">
      <div style="border:1px solid #d4cfc4;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 1px 0 rgba(25,24,22,0.08)">
        <div style="padding:28px 26px 22px;border-bottom:1px solid #d4cfc4;background:#fbfaf7">
          <p style="margin:0 0 10px;color:#80621e;font-size:11px;font-weight:900;letter-spacing:0.18em;text-transform:uppercase">Subscription renewed</p>
          <h1 style="margin:0;color:#191816;font-size:26px;line-height:1.3;font-weight:900">구독이 갱신되었습니다</h1>
        </div>
        <div style="padding:26px">
          <p style="display:inline-block;margin:0 0 16px;border:1px solid #d4cfc4;border-radius:3px;padding:6px 10px;color:#047857;background:#e7f4ed;font-size:12px;font-weight:900">완료</p>
          <p style="margin:0 0 14px;color:#625f57;font-size:15px;line-height:1.75">${escapeHtml(customerName)}님, ${escapeHtml(planLabel)} 월 구독이 정상적으로 갱신되었습니다.</p>
          <p style="margin:0 0 14px;color:#625f57;font-size:15px;line-height:1.75">이번 결제로 월간 크레딧이 새로 충전되었습니다.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border-collapse:collapse">
            <tbody>
              <tr><td style="padding:10px 0;border-bottom:1px solid #d4cfc4;color:#625f57;font-size:13px">플랜</td><td style="padding:10px 0;border-bottom:1px solid #d4cfc4;color:#191816;font-size:13px;font-weight:800;text-align:right">${escapeHtml(planLabel)}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #d4cfc4;color:#625f57;font-size:13px">결제 금액</td><td style="padding:10px 0;border-bottom:1px solid #d4cfc4;color:#191816;font-size:13px;font-weight:800;text-align:right">${escapeHtml(amountText)}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #d4cfc4;color:#625f57;font-size:13px">충전 크레딧</td><td style="padding:10px 0;border-bottom:1px solid #d4cfc4;color:#191816;font-size:13px;font-weight:800;text-align:right">${creditsGranted.toLocaleString("ko-KR")} 크레딧</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #d4cfc4;color:#625f57;font-size:13px">다음 갱신 예정일</td><td style="padding:10px 0;border-bottom:1px solid #d4cfc4;color:#191816;font-size:13px;font-weight:800;text-align:right">${escapeHtml(periodEndStr)}</td></tr>
            </tbody>
          </table>
          <a href="${APP_URL}/mypage?tab=plan" style="display:inline-block;margin-top:4px;background:#050505;color:#f4f1e8;text-decoration:none;border:1px solid #050505;border-radius:3px;padding:12px 18px;font-size:13px;font-weight:900;letter-spacing:0.04em">구독 상태 확인하기</a>
          <p style="margin:22px 0 0;color:#625f57;font-size:12px;line-height:1.7">구독 해지는 마이페이지의 플랜/결제 탭에서 관리할 수 있습니다.</p>
          <div style="margin-top:28px;border-top:1px solid #d4cfc4;padding-top:18px">
            <p style="margin:0;color:#625f57;font-size:12px;line-height:1.7">본 메일은 HairFit 서비스 이용과 관련해 발송되었습니다.<br />문의가 필요하시면 마이페이지 또는 고객지원 메뉴를 이용해 주세요.</p>
            <p style="margin:14px 0 0;color:#191816;font-size:12px;line-height:1.7;font-weight:800">HairFit<br /><span style="color:#625f57;font-weight:600">내 스타일을 미리 확인하는 헤어 시뮬레이션 서비스</span></p>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  const text = [
    "[HairFit] 구독이 갱신되었습니다",
    "",
    `${customerName}님, ${planLabel} 월 구독이 정상적으로 갱신되었습니다.`,
    "이번 결제로 월간 크레딧이 새로 충전되었습니다.",
    "",
    `플랜: ${planLabel}`,
    `결제 금액: ${amountText}`,
    `충전 크레딧: ${creditsGranted.toLocaleString("ko-KR")} 크레딧`,
    `다음 갱신 예정일: ${periodEndStr}`,
    "",
    `구독 상태 확인하기: ${APP_URL}/mypage?tab=plan`,
    "",
    "본 메일은 HairFit 서비스 이용과 관련해 발송되었습니다.",
  ].join("\n");

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to,
      subject: `[HairFit] ${planLabel} 구독이 갱신되었습니다`,
      html,
      text,
    }),
  }).catch((e: unknown) => console.error("[cron-renewal] email error:", e));
}

// ─── 메인 ───────────────────────────────────────────────────────────────────

interface DueSubscription {
  subscription_id: string;
  user_id: string;
  plan_key: string;
  pg_billing_key: string | null;
  pg_billing_key_encrypted: string | null;
  pg_billing_key_hash: string | null;
  amount_krw: number;
  credits_per_cycle: number;
  renewal_failure_count?: number | null;
}

interface SubscriptionKeyRow {
  id: string;
  pg_billing_key_encrypted: string | null;
  pg_billing_key_hash: string | null;
}

interface PaymentTransactionRow {
  id: string;
}

interface RenewalFailureSupabaseClient {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (
        column: string,
        value: unknown,
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
}

function buildPaymentMetadata(
  sub: DueSubscription,
  paymentId: string,
  orderName: string,
  details: Record<string, unknown> = {},
) {
  return {
    source: "cron-subscription-renewal",
    plan: sub.plan_key,
    portone_payment_id: paymentId,
    order_name: orderName,
    billing_key_storage: sub.pg_billing_key_encrypted
      ? "encrypted"
      : "legacy_plaintext",
    ...details,
  };
}

async function resolveBillingKey(sub: DueSubscription) {
  if (sub.pg_billing_key_encrypted) {
    return decryptEncryptedBillingKey(sub.pg_billing_key_encrypted);
  }
  if (sub.pg_billing_key) {
    return sub.pg_billing_key;
  }
  throw new Error("subscription billing key is missing");
}

function renewalFailureCount(sub: DueSubscription) {
  const count = Number(sub.renewal_failure_count ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function nextRenewalRetryAt(nextFailureCount: number) {
  const retryAt = new Date();
  const delayDays = Math.min(Math.max(nextFailureCount, 1), 7);
  retryAt.setDate(retryAt.getDate() + delayDays);
  return retryAt.toISOString();
}

function buildRenewalPaymentId(plan: string) {
  const normalizedPlan = plan.trim().toLowerCase();
  const planCode =
    normalizedPlan === "basic"
      ? "b"
      : normalizedPlan === "standard"
        ? "s"
        : normalizedPlan === "pro"
          ? "p"
          : "x";
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const paymentId = `ren-${planCode}-${Date.now().toString(36)}-${random}`;
  if (paymentId.length > 32) {
    throw new Error("PortOne paymentId exceeds 32 characters");
  }
  return paymentId;
}

async function markSubscriptionRenewalFailed(
  supabase: RenewalFailureSupabaseClient,
  sub: DueSubscription,
  failureCode: string,
  failureMessage: string,
) {
  const nextFailureCount = renewalFailureCount(sub) + 1;
  sub.renewal_failure_count = nextFailureCount;

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: "past_due",
      renewal_failure_count: nextFailureCount,
      renewal_last_failed_at: new Date().toISOString(),
      renewal_next_retry_at: nextRenewalRetryAt(nextFailureCount),
      renewal_failure_code: failureCode,
      renewal_failure_message: failureMessage,
    })
    .eq("id", sub.subscription_id);

  if (error) {
    console.error(
      "[cron-renewal] renewal failure tracking update error:",
      error.message,
    );
  }
}

Deno.serve(async () => {
  if (!PORTONE_V2_API_SECRET) {
    console.error("[cron-renewal] Missing PORTONE_V2_API_SECRET");
    return new Response(
      JSON.stringify({ error: "Missing PORTONE_V2_API_SECRET" }),
      { status: 500 },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 갱신 대상 구독 조회
  const { data: dueRows, error: dueError } = await supabase.rpc(
    "get_subscriptions_due_for_renewal",
  );

  if (dueError) {
    console.error("[cron-renewal] RPC error:", dueError.message);
    return new Response(JSON.stringify({ error: dueError.message }), {
      status: 500,
    });
  }

  const dueSubscriptions = (dueRows ?? []) as Array<Omit<
    DueSubscription,
    "pg_billing_key_encrypted" | "pg_billing_key_hash"
  >>;

  if (dueSubscriptions.length === 0) {
    return new Response(
      JSON.stringify({ renewed: 0, failed: 0, message: "no subscriptions due" }),
      { status: 200 },
    );
  }

  const subscriptionIds = dueSubscriptions.map((s) => s.subscription_id);
  const { data: keyRows, error: keyRowsError } = await supabase
    .from("user_subscriptions")
    .select("id, pg_billing_key_encrypted, pg_billing_key_hash")
    .in("id", subscriptionIds);

  if (keyRowsError) {
    console.error("[cron-renewal] key lookup error:", keyRowsError.message);
    return new Response(JSON.stringify({ error: keyRowsError.message }), {
      status: 500,
    });
  }

  const keyBySubscriptionId = new Map<string, SubscriptionKeyRow>();
  for (const row of (keyRows ?? []) as SubscriptionKeyRow[]) {
    keyBySubscriptionId.set(row.id, row);
  }

  const subscriptions: DueSubscription[] = dueSubscriptions.map((sub) => {
    const keyRow = keyBySubscriptionId.get(sub.subscription_id);
    return {
      ...sub,
      pg_billing_key_encrypted: keyRow?.pg_billing_key_encrypted ?? null,
      pg_billing_key_hash: keyRow?.pg_billing_key_hash ?? null,
    };
  });

  // 유저 이메일 일괄 조회
  const userIds = [...new Set(subscriptions.map((s) => s.user_id))];
  const { data: userRows } = await supabase
    .from("users")
    .select("id, email, display_name")
    .in("id", userIds);

  const emailByUserId = new Map<string, { email: string; displayName: string | null }>();
  for (const u of userRows ?? []) {
    if (u.email) {
      emailByUserId.set(u.id as string, {
        email: u.email as string,
        displayName: (u.display_name as string | null) ?? null,
      });
    }
  }

  let renewed = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    const paymentId = buildRenewalPaymentId(sub.plan_key);
    const orderName =
      `HairFit ${sub.plan_key.charAt(0).toUpperCase() + sub.plan_key.slice(1)} - 월 구독`;
    let txId: string | null = null;
    let paymentCharged = false;
    let paymentAttempted = false;
    let txFailureRecorded = false;
    let subscriptionFailureRecorded = false;

    try {
      const billingKey = await resolveBillingKey(sub);

      // 1. payment_transactions pending 기록
      const { data: txRow, error: txInsertError } = await supabase
        .from("payment_transactions")
        .insert({
          user_id: sub.user_id,
          subscription_id: sub.subscription_id,
          provider: "portone",
          provider_order_id: paymentId,
          provider_customer_id: sub.user_id,
          amount: sub.amount_krw,
          currency: "KRW",
          status: "pending",
          credits_to_grant: sub.credits_per_cycle,
          metadata: buildPaymentMetadata(sub, paymentId, orderName),
        })
        .select("id")
        .single<PaymentTransactionRow>();

      if (txInsertError || !txRow) {
        throw new Error(txInsertError?.message ?? "payment transaction insert failed");
      }
      txId = txRow.id;

      // 2. PortOne 빌링키 결제
      paymentAttempted = true;
      const chargeResult = await chargeBillingKey(
        paymentId,
        billingKey,
        orderName,
        sub.user_id,
        sub.amount_krw,
      );
      const result = await getPayment(paymentId);

      if (!result) {
        await supabase
          .from("payment_transactions")
          .update({
            status: "failed",
            failure_code: "portone_payment_not_found",
            failure_message: "PortOne payment not found after billing-key charge",
            metadata: buildPaymentMetadata(sub, paymentId, orderName, {
              portoneCharge: chargeResult,
              failureCode: "portone_payment_not_found",
              failureMessage: "PortOne payment not found after billing-key charge",
            }),
          })
          .eq("id", txId);
        txFailureRecorded = true;
        await markSubscriptionRenewalFailed(
          supabase as unknown as RenewalFailureSupabaseClient,
          sub,
          "portone_payment_not_found",
          "PortOne payment not found after billing-key charge",
        );
        subscriptionFailureRecorded = true;
        throw new Error("PortOne payment not found after billing-key charge");
      }

      if (result.status !== "PAID") {
        const message = result.failureMessage ?? `status=${result.status}`;
        await supabase
          .from("payment_transactions")
          .update({
            status: "failed",
            provider_transaction_id: result.pgTxId,
            failure_code: result.failureCode,
            failure_message: message,
            metadata: buildPaymentMetadata(sub, paymentId, orderName, {
              portoneCharge: chargeResult,
              portone: result,
              failureCode: result.failureCode,
              failureMessage: message,
            }),
          })
          .eq("id", txId);
        txFailureRecorded = true;
        await markSubscriptionRenewalFailed(
          supabase as unknown as RenewalFailureSupabaseClient,
          sub,
          result.failureCode ?? "portone_payment_failed",
          message,
        );
        subscriptionFailureRecorded = true;
        throw new Error(message);
      }

      if (result.amountTotal !== sub.amount_krw || result.currency !== "KRW") {
        const message = "PortOne payment amount or currency mismatch";
        await supabase
          .from("payment_transactions")
          .update({
            status: "failed",
            provider_transaction_id: result.pgTxId,
            failure_code: "amount_or_currency_mismatch",
            failure_message: message,
            metadata: buildPaymentMetadata(sub, paymentId, orderName, {
              portoneCharge: chargeResult,
              portone: result,
              failureCode: "amount_or_currency_mismatch",
              failureMessage: message,
              expectedAmount: sub.amount_krw,
              expectedCurrency: "KRW",
            }),
          })
          .eq("id", txId);
        txFailureRecorded = true;
        await markSubscriptionRenewalFailed(
          supabase as unknown as RenewalFailureSupabaseClient,
          sub,
          "amount_or_currency_mismatch",
          message,
        );
        subscriptionFailureRecorded = true;
        throw new Error(message);
      }

      paymentCharged = true;

      // 3. payment_transactions paid 반영
      const { error: txPaidError } = await supabase
        .from("payment_transactions")
        .update({
          status: "paid",
          provider_transaction_id: result.pgTxId,
          failure_code: null,
          failure_message: null,
          paid_at: result.paidAt ?? new Date().toISOString(),
          metadata: buildPaymentMetadata(sub, paymentId, orderName, {
            portoneCharge: chargeResult,
            portone: result,
            providerTransactionId: result.pgTxId,
          }),
        })
        .eq("id", txId);

      if (txPaidError) {
        throw new Error(`payment transaction paid update failed: ${txPaidError.message}`);
      }

      // 4. advance_subscription_period: 현재 period_end + 1달
      const newPeriodStart = new Date();
      const newPeriodEnd = new Date(newPeriodStart);
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

      const { error: periodError } = await supabase.rpc(
        "advance_subscription_period",
        {
          p_subscription_id: sub.subscription_id,
          p_payment_id: paymentId,
          p_new_period_start: newPeriodStart.toISOString(),
          p_new_period_end: newPeriodEnd.toISOString(),
        },
      );
      if (periodError) {
        console.error(
          `[cron-renewal] advance period error sub=${sub.subscription_id}:`,
          periodError.message,
        );
        throw new Error(periodError.message);
      }

      // 5. 크레딧 지급
      const { error: creditsError } = await supabase.rpc(
        "grant_subscription_credits",
        {
          p_user_id: sub.user_id,
          p_credits: sub.credits_per_cycle,
          p_subscription_id: sub.subscription_id,
          p_reason: "subscription_renewal",
          p_payment_transaction_id: txId,
        },
      );
      if (creditsError) {
        console.error(
          `[cron-renewal] credit error sub=${sub.subscription_id}:`,
          creditsError.message,
        );
        throw new Error(creditsError.message);
      }

      // 6. 갱신 이메일 (실패해도 전체 흐름에 영향 없음)
      const userEmail = emailByUserId.get(sub.user_id);
      if (userEmail) {
        await sendRenewalEmail(
          userEmail.email,
          userEmail.displayName,
          sub.plan_key,
          sub.amount_krw,
          sub.credits_per_cycle,
          newPeriodEnd,
        );
      }

      renewed++;
      console.log(
        `[cron-renewal] OK sub=${sub.subscription_id} user=${sub.user_id}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron-renewal] FAIL sub=${sub.subscription_id}:`, msg);

      if (txId && !paymentCharged && !txFailureRecorded) {
        await supabase
          .from("payment_transactions")
          .update({
            status: "failed",
            failure_code: "subscription_renewal_error",
            failure_message: msg,
            metadata: buildPaymentMetadata(sub, paymentId, orderName, {
              failureMessage: msg,
            }),
          })
          .eq("id", txId);
      }

      if (!paymentCharged && !subscriptionFailureRecorded) {
        await markSubscriptionRenewalFailed(
          supabase as unknown as RenewalFailureSupabaseClient,
          sub,
          paymentAttempted
            ? "subscription_renewal_error"
            : "subscription_renewal_prepare_error",
          msg,
        );
      }

      failed++;
    }
  }

  console.log(`[cron-renewal] renewed=${renewed} failed=${failed}`);
  return new Response(JSON.stringify({ renewed, failed }), { status: 200 });
});
