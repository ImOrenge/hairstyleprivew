import "server-only";

import {
  GOOGLE_PLAY_PACKAGE_NAME,
  GOOGLE_PLAY_PRODUCT_KEYS,
  getGooglePlayProduct,
  getGooglePlayProductById,
  type GooglePlayCatalogProduct,
  type GooglePlayProductKey,
  type MobileGooglePlayCatalogResponse,
  type MobileGooglePlayPurchaseIntentResponse,
  type MobileGooglePlayPurchaseVerificationResponse,
} from "@hairfit/shared";
import {
  acknowledgeGooglePlayPurchase,
  consumeGooglePlayPurchase,
  getGooglePlayPurchase,
  getGooglePlaySubscriptionByToken,
  isGooglePlayApiConfigured,
} from "./google-play-api";
import {
  mapGooglePlaySubscriptionState,
  type NormalizedGooglePlayPurchase,
} from "./google-play-contract";
import {
  encryptGooglePlayPurchaseToken,
  hashGooglePlayPurchaseToken,
  isGooglePlayTokenEncryptionConfigured,
  obfuscateGooglePlayAccountId,
} from "./google-play-secret";
import { evaluateGooglePlayEligibility } from "./google-play-eligibility";
import {
  validateGooglePlayPurchaseIdentity,
  validateGooglePlayPurchaseToken,
} from "./google-play-validation";

const INTENT_TTL_MS = 15 * 60 * 1000;

interface DbError {
  code?: string;
  message: string;
}

interface DbResult<T> {
  data: T | null;
  error: DbError | null;
}

interface DbListResult<T> {
  data: T[] | null;
  error: DbError | null;
}

interface DbQuery<T> extends PromiseLike<DbListResult<T>> {
  select: (columns?: string) => DbQuery<T>;
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => DbQuery<T>;
  upsert: (values: Record<string, unknown>, options?: Record<string, unknown>) => DbQuery<T>;
  update: (values: Record<string, unknown>) => DbQuery<T>;
  eq: (column: string, value: unknown) => DbQuery<T>;
  maybeSingle: () => Promise<DbResult<T>>;
  single: () => Promise<DbResult<T>>;
  limit: (count: number) => DbQuery<T>;
}

export interface GooglePlayBillingDatabase {
  from: <T = Record<string, unknown>>(table: string) => DbQuery<T>;
  rpc: (fn: string, params: Record<string, unknown>) => Promise<DbResult<unknown>>;
}

interface SubscriptionRow {
  id: string;
  plan_key: string;
  status: string;
  current_period_end: string | null;
  pg_billing_key: string | null;
  pg_billing_key_encrypted: string | null;
  pg_billing_key_hash: string | null;
  pg_latest_payment_id: string | null;
  billing_provider: "portone" | "google_play" | null;
}

interface IntentRow {
  id: string;
  user_id: string;
  product_key: GooglePlayProductKey;
  product_id: string;
  product_type: string;
  obfuscated_account_id: string;
  obfuscated_profile_id: string;
  status: string;
  expires_at: string;
}

interface PurchaseRow {
  id: string;
  purchase_intent_id: string | null;
  user_id: string;
  product_key: GooglePlayProductKey;
  product_id: string;
  product_type: string;
  purchase_token_hash: string;
  latest_order_id: string | null;
  payment_transaction_id: string | null;
  subscription_id: string | null;
  state: string;
  acknowledged: boolean;
  consumed: boolean;
}

interface PaymentRow {
  id: string;
  user_id: string;
  provider_order_id: string;
  subscription_id: string | null;
  status: string;
}

interface PendingPortonePaymentRow {
  provider_order_id: string;
}

export class GooglePlayBillingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
  }
}

function isActiveSubscription(row: SubscriptionRow | null) {
  if (!row || (row.status !== "active" && row.status !== "trialing")) return false;
  if (!row.current_period_end) return true;
  const end = new Date(row.current_period_end);
  return Number.isNaN(end.getTime()) || end.getTime() >= Date.now();
}

function hasPortoneBillingKey(row: SubscriptionRow | null) {
  return Boolean(row?.pg_billing_key || row?.pg_billing_key_encrypted || row?.pg_billing_key_hash);
}

function enabledByEnvironment() {
  return process.env.GOOGLE_PLAY_BILLING_ENABLED?.trim().toLowerCase() === "true";
}

export function isGooglePlayBillingConfigured() {
  return enabledByEnvironment() && isGooglePlayApiConfigured() && isGooglePlayTokenEncryptionConfigured();
}

async function loadSubscription(db: GooglePlayBillingDatabase, userId: string) {
  const { data, error } = await db
    .from<SubscriptionRow>("user_subscriptions")
    .select("id,plan_key,status,current_period_end,pg_billing_key,pg_billing_key_encrypted,pg_billing_key_hash,pg_latest_payment_id,billing_provider")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new GooglePlayBillingError("subscription_lookup_failed", error.message, 500);
  return data;
}

async function hasPendingMobilePortonePayment(db: GooglePlayBillingDatabase, userId: string) {
  const { data, error } = await db
    .from<PendingPortonePaymentRow>("payment_transactions")
    .select("provider_order_id")
    .eq("user_id", userId)
    .eq("provider", "portone")
    .eq("status", "pending")
    .limit(20);
  if (error) throw new GooglePlayBillingError("payment_lookup_failed", error.message, 500);
  return data?.some((payment) => payment.provider_order_id.startsWith("mob-")) === true;
}

function productEligibility(product: GooglePlayCatalogProduct, subscription: SubscriptionRow | null) {
  return evaluateGooglePlayEligibility(product.productType, {
    active: isActiveSubscription(subscription),
    provider: subscription?.billing_provider ?? null,
    hasPortoneBillingKey: hasPortoneBillingKey(subscription),
    isLegacyMobile: subscription?.pg_latest_payment_id?.startsWith("mob-") === true,
  });
}

export async function getGooglePlayCatalog(
  db: GooglePlayBillingDatabase,
  userId: string,
): Promise<MobileGooglePlayCatalogResponse> {
  const subscription = await loadSubscription(db, userId);
  const active = isActiveSubscription(subscription);
  return {
    enabled: isGooglePlayBillingConfigured(),
    packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || GOOGLE_PLAY_PACKAGE_NAME,
    activeSubscriptionProvider: active ? subscription?.billing_provider ?? "portone" : null,
    canTransitionLegacyMobile: Boolean(
      active &&
      subscription?.billing_provider !== "google_play" &&
      !hasPortoneBillingKey(subscription) &&
      subscription?.pg_latest_payment_id?.startsWith("mob-") === true
    ),
    products: GOOGLE_PLAY_PRODUCT_KEYS.map((key) => {
      const product = getGooglePlayProduct(key);
      const eligibility = productEligibility(product, subscription);
      return {
        ...product,
        eligible: eligibility.eligible,
        eligibilityReason: eligibility.reason,
      };
    }),
  };
}

export async function createGooglePlayPurchaseIntent(
  db: GooglePlayBillingDatabase,
  userId: string,
  productKey: GooglePlayProductKey,
): Promise<MobileGooglePlayPurchaseIntentResponse> {
  if (!isGooglePlayBillingConfigured()) {
    throw new GooglePlayBillingError("billing_disabled", "Google Play 결제가 아직 활성화되지 않았습니다.", 503);
  }
  const product = getGooglePlayProduct(productKey);
  if (
    product.productType === "subscription" &&
    await hasPendingMobilePortonePayment(db, userId)
  ) {
    throw new GooglePlayBillingError(
      "portone_pending",
      "확인이 끝나지 않은 기존 모바일 결제가 있습니다. 해당 결제 상태를 먼저 확인해 주세요.",
      409,
    );
  }
  const eligibility = productEligibility(product, await loadSubscription(db, userId));
  if (!eligibility.eligible) {
    const message = eligibility.reason === "subscription_required"
      ? "단건 이용권은 활성 유료 구독자만 구매할 수 있습니다."
      : eligibility.reason === "portone_recurring"
        ? "웹 자동결제 구독을 먼저 해지하고 이용 기간이 끝난 뒤 Play 구독으로 전환해 주세요."
        : "이미 활성 Play 구독이 있습니다. Google Play에서 구독을 관리해 주세요.";
    throw new GooglePlayBillingError(eligibility.reason, message, 409);
  }

  const obfuscatedAccountId = await obfuscateGooglePlayAccountId(userId);
  const obfuscatedProfileId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS).toISOString();
  const { data, error } = await db
    .from<{ id: string }>("google_play_purchase_intents")
    .insert({
      user_id: userId,
      product_key: product.key,
      product_id: product.productId,
      product_type: product.productType,
      obfuscated_account_id: obfuscatedAccountId,
      obfuscated_profile_id: obfuscatedProfileId,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new GooglePlayBillingError("intent_create_failed", error?.message ?? "Purchase intent was not created", 500);
  }
  return {
    intentId: data.id,
    product,
    obfuscatedAccountId,
    obfuscatedProfileId,
    expiresAt,
  };
}

async function loadPurchaseByHash(db: GooglePlayBillingDatabase, tokenHash: string) {
  const { data, error } = await db
    .from<PurchaseRow>("google_play_purchases")
    .select("id,purchase_intent_id,user_id,product_key,product_id,product_type,purchase_token_hash,latest_order_id,payment_transaction_id,subscription_id,state,acknowledged,consumed")
    .eq("purchase_token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new GooglePlayBillingError("purchase_lookup_failed", error.message, 500);
  return data;
}

async function resolveIntent(
  db: GooglePlayBillingDatabase,
  purchase: NormalizedGooglePlayPurchase,
  product: GooglePlayCatalogProduct,
  expectedUserId?: string,
) {
  if (!purchase.obfuscatedProfileId) {
    throw new GooglePlayBillingError("purchase_intent_missing", "구매 계정 정보를 확인할 수 없습니다.", 409);
  }
  const { data, error } = await db
    .from<IntentRow>("google_play_purchase_intents")
    .select("id,user_id,product_key,product_id,product_type,obfuscated_account_id,obfuscated_profile_id,status,expires_at")
    .eq("obfuscated_profile_id", purchase.obfuscatedProfileId)
    .maybeSingle();
  if (error) throw new GooglePlayBillingError("intent_lookup_failed", error.message, 500);
  if (!data || data.status !== "pending") {
    throw new GooglePlayBillingError("purchase_intent_invalid", "유효한 구매 준비 정보를 찾지 못했습니다.", 409);
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await db.from("google_play_purchase_intents").update({ status: "expired" }).eq("id", data.id);
    throw new GooglePlayBillingError("purchase_intent_expired", "구매 준비 시간이 만료되었습니다.", 409);
  }
  const identityError = validateGooglePlayPurchaseIdentity({
    intentUserId: data.user_id,
    expectedUserId,
    intentProductKey: data.product_key,
    expectedProductKey: product.key,
    intentProductId: data.product_id,
    expectedProductId: product.productId,
    intentAccountId: data.obfuscated_account_id,
    purchaseAccountId: purchase.obfuscatedAccountId,
    intentProfileId: data.obfuscated_profile_id,
    purchaseProfileId: purchase.obfuscatedProfileId,
  });
  if (identityError) {
    const message = identityError === "purchase_account_mismatch"
      ? "구매 계정이 현재 계정과 일치하지 않습니다."
      : identityError === "purchase_product_mismatch"
        ? "구매 상품이 준비한 상품과 일치하지 않습니다."
        : "Google Play 구매 식별자가 일치하지 않습니다.";
    throw new GooglePlayBillingError(
      identityError,
      message,
      identityError === "purchase_account_mismatch" ? 403 : 409,
    );
  }
  return data;
}

async function savePurchaseBinding(
  db: GooglePlayBillingDatabase,
  input: {
    existing: PurchaseRow | null;
    userId: string;
    product: GooglePlayCatalogProduct;
    purchase: NormalizedGooglePlayPurchase;
    tokenHash: string;
    encryptedToken: string;
    intentId?: string | null;
    transactionId?: string | null;
    subscriptionId?: string | null;
  },
) {
  const values = {
    user_id: input.userId,
    product_key: input.product.key,
    product_id: input.product.productId,
    product_type: input.product.productType,
    purchase_intent_id: input.intentId ?? input.existing?.purchase_intent_id ?? null,
    purchase_token_hash: input.tokenHash,
    purchase_token_encrypted: input.encryptedToken,
    latest_order_id: input.purchase.orderId,
    payment_transaction_id: input.transactionId ?? input.existing?.payment_transaction_id ?? null,
    subscription_id: input.subscriptionId ?? input.existing?.subscription_id ?? null,
    state: input.purchase.state,
    acknowledged: input.purchase.acknowledged,
    consumed: input.purchase.consumed,
    expiry_time: input.purchase.expiryTime,
    auto_renewing: input.purchase.autoRenewing,
    last_verified_at: new Date().toISOString(),
  };
  const { data, error } = await db
    .from<PurchaseRow>("google_play_purchases")
    .upsert(values, { onConflict: "purchase_token_hash" })
    .select("id,purchase_intent_id,user_id,product_key,product_id,product_type,purchase_token_hash,latest_order_id,payment_transaction_id,subscription_id,state,acknowledged,consumed")
    .single();
  if (error || !data) throw new GooglePlayBillingError("purchase_save_failed", error?.message ?? "Purchase was not saved", 500);
  return data;
}

async function loadPaymentByOrder(db: GooglePlayBillingDatabase, orderId: string) {
  const { data, error } = await db
    .from<PaymentRow>("payment_transactions")
    .select("id,user_id,provider_order_id,subscription_id,status")
    .eq("provider", "google_play")
    .eq("provider_order_id", orderId)
    .maybeSingle();
  if (error) throw new GooglePlayBillingError("payment_lookup_failed", error.message, 500);
  return data;
}

async function createPayment(
  db: GooglePlayBillingDatabase,
  userId: string,
  product: GooglePlayCatalogProduct,
  orderId: string,
) {
  const existing = await loadPaymentByOrder(db, orderId);
  if (existing) {
    if (existing.user_id !== userId) {
      throw new GooglePlayBillingError("payment_account_mismatch", "이미 다른 계정에 연결된 주문입니다.", 409);
    }
    return { row: existing, alreadyProcessed: existing.status === "paid" };
  }
  const { data, error } = await db
    .from<PaymentRow>("payment_transactions")
    .insert({
      user_id: userId,
      provider: "google_play",
      provider_order_id: orderId,
      provider_customer_id: userId,
      status: "paid",
      currency: "KRW",
      amount: product.priceKrw,
      credits_to_grant: product.credits,
      paid_at: new Date().toISOString(),
      metadata: {
        source: "google-play",
        productKey: product.key,
        productId: product.productId,
        productType: product.productType,
        basePlanId: product.basePlanId,
      },
    })
    .select("id,user_id,provider_order_id,subscription_id,status")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      const raced = await loadPaymentByOrder(db, orderId);
      if (raced?.user_id === userId) return { row: raced, alreadyProcessed: true };
    }
    throw new GooglePlayBillingError("payment_create_failed", error?.message ?? "Payment was not created", 500);
  }
  return { row: data, alreadyProcessed: false };
}

async function upsertSubscription(
  db: GooglePlayBillingDatabase,
  userId: string,
  product: GooglePlayCatalogProduct,
  purchase: NormalizedGooglePlayPurchase,
  purchaseId: string,
  orderId: string,
) {
  const current = await loadSubscription(db, userId);
  if (isActiveSubscription(current) && current?.billing_provider !== "google_play" && hasPortoneBillingKey(current)) {
    await db.from("google_play_purchase_intents").update({ status: "conflict" }).eq("obfuscated_profile_id", purchase.obfuscatedProfileId);
    throw new GooglePlayBillingError("portone_recurring", "웹 자동결제 구독과 동시에 Play 구독을 시작할 수 없습니다.", 409);
  }
  const mapped = mapGooglePlaySubscriptionState(purchase.state);
  const now = new Date().toISOString();
  const end = purchase.expiryTime ?? new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from<{ id: string }>("user_subscriptions")
    .upsert({
      user_id: userId,
      plan_key: product.key,
      status: mapped.status,
      billing_provider: "google_play",
      provider_product_id: product.productId,
      google_play_purchase_id: purchaseId,
      pg_billing_key: null,
      pg_billing_key_encrypted: null,
      pg_billing_key_hash: null,
      pg_latest_payment_id: orderId,
      credits_per_cycle: product.credits,
      current_period_start: now,
      current_period_end: end,
      cancel_at_period_end: mapped.cancelAtPeriodEnd,
      canceled_at: mapped.status === "expired" ? now : null,
      renewal_failure_count: purchase.state === "on_hold" ? 1 : 0,
      renewal_last_failed_at: purchase.state === "on_hold" ? now : null,
      renewal_next_retry_at: null,
      renewal_failure_code: purchase.state === "on_hold" ? "google_play_on_hold" : null,
      renewal_failure_message: null,
    }, { onConflict: "user_id" })
    .select("id")
    .single();
  if (error || !data) throw new GooglePlayBillingError("subscription_save_failed", error?.message ?? "Subscription was not saved", 500);
  return data.id;
}

async function finishStoreTransaction(product: GooglePlayCatalogProduct, token: string) {
  try {
    if (product.productType === "consumable") {
      await consumeGooglePlayPurchase(product.productId, token);
    } else {
      await acknowledgeGooglePlayPurchase(product, token);
    }
    return true;
  } catch {
    return false;
  }
}

export async function processGooglePlayPurchase(
  db: GooglePlayBillingDatabase,
  input: { purchaseToken: string; productId?: string; expectedUserId?: string },
): Promise<MobileGooglePlayPurchaseVerificationResponse> {
  const token = input.purchaseToken.trim();
  if (!validateGooglePlayPurchaseToken(token)) {
    throw new GooglePlayBillingError("purchase_token_invalid", "구매 토큰이 올바르지 않습니다.");
  }
  if (!isGooglePlayBillingConfigured()) {
    throw new GooglePlayBillingError("billing_disabled", "Google Play 결제가 아직 활성화되지 않았습니다.", 503);
  }

  const tokenHash = await hashGooglePlayPurchaseToken(token);
  const existingBinding = await loadPurchaseByHash(db, tokenHash);
  let product = input.productId ? getGooglePlayProductById(input.productId) : null;
  let purchase: NormalizedGooglePlayPurchase;
  if (product) {
    purchase = await getGooglePlayPurchase(product, token);
  } else if (existingBinding) {
    product = getGooglePlayProduct(existingBinding.product_key);
    purchase = await getGooglePlayPurchase(product, token);
  } else {
    const resolved = await getGooglePlaySubscriptionByToken(token);
    product = resolved.product;
    purchase = resolved.purchase;
  }
  if (!product || purchase.productId !== product.productId) {
    throw new GooglePlayBillingError("purchase_product_mismatch", "Google Play 상품이 허용된 상품과 일치하지 않습니다.", 409);
  }
  if (existingBinding && existingBinding.product_id !== product.productId) {
    throw new GooglePlayBillingError("purchase_binding_mismatch", "구매 토큰의 기존 상품 연결이 일치하지 않습니다.", 409);
  }

  const intent = existingBinding
    ? null
    : await resolveIntent(db, purchase, product, input.expectedUserId);
  const userId = existingBinding?.user_id ?? intent?.user_id;
  if (!userId) throw new GooglePlayBillingError("purchase_owner_missing", "구매 소유자를 확인할 수 없습니다.", 409);
  if (input.expectedUserId && input.expectedUserId !== userId) {
    throw new GooglePlayBillingError("purchase_account_mismatch", "구매 계정이 현재 계정과 일치하지 않습니다.", 403);
  }

  const encryptedToken = await encryptGooglePlayPurchaseToken(token);
  const boundIntentId = existingBinding?.purchase_intent_id ?? intent?.id ?? null;
  if (purchase.state === "pending") {
    await savePurchaseBinding(db, {
      existing: existingBinding,
      userId,
      product,
      purchase,
      tokenHash,
      encryptedToken,
      intentId: boundIntentId,
    });
    if (intent) {
      await db.from("google_play_purchase_intents").update({
        status: "bound",
        purchase_token_hash: tokenHash,
      }).eq("id", intent.id);
    }
    return {
      ok: true,
      productKey: product.key,
      productType: product.productType,
      state: "pending",
      transactionId: null,
      subscriptionId: null,
      creditsGranted: 0,
      shouldFinishTransaction: false,
    };
  }
  if (!purchase.entitled || !purchase.orderId) {
    if (existingBinding) {
      await savePurchaseBinding(db, {
        existing: existingBinding,
        userId,
        product,
        purchase,
        tokenHash,
        encryptedToken,
        intentId: boundIntentId,
      });
      if (product.productType === "subscription" && existingBinding.subscription_id) {
        const mapped = mapGooglePlaySubscriptionState(purchase.state);
        await db.from("user_subscriptions").update({
          status: mapped.status,
          cancel_at_period_end: mapped.cancelAtPeriodEnd,
          current_period_end: purchase.expiryTime,
        }).eq("id", existingBinding.subscription_id);
      }
      return {
        ok: true,
        productKey: product.key,
        productType: product.productType,
        state: "already_processed",
        transactionId: existingBinding.payment_transaction_id,
        subscriptionId: existingBinding.subscription_id,
        creditsGranted: 0,
        shouldFinishTransaction: false,
      };
    }
    throw new GooglePlayBillingError("purchase_not_entitled", "Google Play에서 완료된 구매를 확인하지 못했습니다.", 409);
  }

  const payment = await createPayment(db, userId, product, purchase.orderId);
  let binding = await savePurchaseBinding(db, {
    existing: existingBinding,
    userId,
    product,
    purchase,
    tokenHash,
    encryptedToken,
    intentId: boundIntentId,
    transactionId: payment.row.id,
  });
  let subscriptionId: string | null = binding.subscription_id;
  if (product.productType === "subscription") {
    subscriptionId = await upsertSubscription(db, userId, product, purchase, binding.id, purchase.orderId);
    await db.from("payment_transactions").update({ subscription_id: subscriptionId }).eq("id", payment.row.id);
    binding = await savePurchaseBinding(db, {
      existing: binding,
      userId,
      product,
      purchase,
      tokenHash,
      encryptedToken,
      intentId: boundIntentId,
      transactionId: payment.row.id,
      subscriptionId,
    });
  }

  const { error: ledgerError } = await db.rpc("apply_payment_credits", {
    p_payment_transaction_id: payment.row.id,
    p_reason: product.productType === "subscription" ? "google_play_subscription" : "google_play_usage_pack",
  });
  if (ledgerError) throw new GooglePlayBillingError("credit_grant_failed", ledgerError.message, 500);

  if (boundIntentId) {
    await db.from("google_play_purchase_intents").update({
      status: "completed",
      purchase_token_hash: tokenHash,
      completed_at: new Date().toISOString(),
    }).eq("id", boundIntentId);
  }

  const storeFinished = (product.productType === "consumable" && purchase.consumed) ||
    (product.productType === "subscription" && purchase.acknowledged)
    ? true
    : await finishStoreTransaction(product, token);
  if (storeFinished) {
    await db.from("google_play_purchases").update({
      acknowledged: product.productType === "subscription" ? true : binding.acknowledged,
      consumed: product.productType === "consumable" ? true : binding.consumed,
    }).eq("id", binding.id);
  }

  return {
    ok: true,
    productKey: product.key,
    productType: product.productType,
    state: payment.alreadyProcessed ? "already_processed" : "paid",
    transactionId: payment.row.id,
    subscriptionId,
    creditsGranted: payment.alreadyProcessed ? 0 : product.credits,
    shouldFinishTransaction: !storeFinished,
  };
}

export async function processGooglePlayVoidedPurchase(
  db: GooglePlayBillingDatabase,
  input: { purchaseToken?: string; orderId?: string; eventType: string },
) {
  const orderId = input.orderId?.trim();
  let payment: PaymentRow | null = orderId ? await loadPaymentByOrder(db, orderId) : null;
  if (!payment && input.purchaseToken) {
    const binding = await loadPurchaseByHash(db, await hashGooglePlayPurchaseToken(input.purchaseToken));
    if (binding?.payment_transaction_id) {
      const { data } = await db.from<PaymentRow>("payment_transactions")
        .select("id,user_id,provider_order_id,subscription_id,status")
        .eq("id", binding.payment_transaction_id)
        .maybeSingle();
      payment = data;
    }
  }
  if (!payment) return { ignored: true as const };
  const { error } = await db.rpc("finalize_automated_refund", {
    p_payment_transaction_id: payment.id,
    p_provider_cancel_id: orderId ?? `google-play:${payment.id}`,
    p_event_type: input.eventType,
    p_metadata: { provider: "google_play" },
  });
  if (error) throw new GooglePlayBillingError("void_finalize_failed", error.message, 500);
  return { ignored: false as const, paymentTransactionId: payment.id };
}
