import "server-only";

import { createHash } from "node:crypto";
import type {
  FashionOfferRevalidationV1,
  FashionOfferSnapshotV1,
  FashionProductOfferV1,
  FashionProductSourceV1,
} from "@hairfit/shared";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "../v2/errors";
import {
  buildFashionProductDisclosureV1,
  classifyFashionOfferRevalidation,
  evaluateRegisteredFashionOfferV1,
  normalizeFashionProductOfferV1,
  type RegisteredFashionProductSourceV1,
} from "./fashion-product-freshness";

const OFFER_SELECT = "offer_id,source_id,seller_id,seller_product_id,product_id,size_system,available_sizes,price_amount,list_price_amount,currency,availability,ships_to_korea,product_url,image_url,observed_at,expires_at,source_fingerprint";
const SOURCE_SELECT = "source_id,source_type,seller_id,territory,allowed_hosts,refresh_sla_minutes,image_usage_policy,affiliate_disclosure_required,enabled,last_healthy_at,quarantined_at,quarantine_reason";
const SNAPSHOT_SELECT = "id,consultation_id,user_id,offer_id,recommendation_revision,replacement_of_snapshot_id,offer_payload,eligibility_reason_codes,policy_version,captured_at";

type Row = Record<string, unknown>;

function rowSource(row: Row): RegisteredFashionProductSourceV1 {
  return {
    sourceId: String(row.source_id),
    sourceType: String(row.source_type) as FashionProductSourceV1["sourceType"],
    sellerId: String(row.seller_id),
    territory: Array.isArray(row.territory) ? row.territory.map(String) : [],
    allowedHosts: Array.isArray(row.allowed_hosts) ? row.allowed_hosts.map(String) : [],
    refreshSlaMinutes: Number(row.refresh_sla_minutes),
    imageUsagePolicy: String(row.image_usage_policy) as FashionProductSourceV1["imageUsagePolicy"],
    affiliateDisclosureRequired: row.affiliate_disclosure_required === true,
    enabled: row.enabled === true,
    lastHealthyAt: row.last_healthy_at ? String(row.last_healthy_at) : null,
    quarantinedAt: row.quarantined_at ? String(row.quarantined_at) : null,
    quarantineReason: row.quarantine_reason ? String(row.quarantine_reason) : null,
  };
}

async function readProduct(productId: string) {
  const result = await getSupabaseAdminClient().from("fashion_products_v2")
    .select("canonical_product_id,brand_name,product_name,category,color_family,material_tags")
    .eq("id", productId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new HairfitV2Error("FASHION_PRODUCT_NOT_FOUND", 404, "상품 정보를 찾지 못했습니다.");
  return result.data as Row;
}

async function rowOffer(row: Row): Promise<FashionProductOfferV1> {
  const product = await readProduct(String(row.product_id));
  return {
    schemaVersion: "fashion-product-offer-v1",
    offerId: String(row.offer_id),
    sourceId: String(row.source_id),
    sellerId: String(row.seller_id),
    sellerProductId: String(row.seller_product_id),
    canonicalProductId: String(product.canonical_product_id),
    brandName: String(product.brand_name),
    productName: String(product.product_name),
    category: String(product.category),
    colorFamily: Array.isArray(product.color_family) ? product.color_family.map(String) : [],
    materialTags: Array.isArray(product.material_tags) ? product.material_tags.map(String) : [],
    sizeSystem: String(row.size_system),
    availableSizes: Array.isArray(row.available_sizes) ? row.available_sizes.map(String) : [],
    price: { amount: Number(row.price_amount), currency: "KRW" },
    listPrice: row.list_price_amount == null ? null : { amount: Number(row.list_price_amount), currency: "KRW" },
    availability: String(row.availability) as FashionProductOfferV1["availability"],
    shipsToKorea: row.ships_to_korea === true,
    productUrl: String(row.product_url),
    imageUrl: row.image_url ? String(row.image_url) : null,
    observedAt: String(row.observed_at),
    expiresAt: String(row.expires_at),
    sourceFingerprint: String(row.source_fingerprint),
  };
}

function rowSnapshot(row: Row): FashionOfferSnapshotV1 {
  const payload = row.offer_payload as FashionProductOfferV1;
  return {
    ...payload,
    snapshotId: String(row.id),
    capturedForConsultationId: String(row.consultation_id),
    recommendationRevision: Number(row.recommendation_revision),
    immutable: true,
  };
}

async function requireConsultationOwner(userId: string, consultationId: string) {
  const owner = await getSupabaseAdminClient().from("consultation_sessions").select("id")
    .eq("id", consultationId).eq("user_id", userId).maybeSingle();
  if (owner.error) throw new Error(owner.error.message);
  if (!owner.data) throw new HairfitV2Error("CONSULTATION_NOT_FOUND", 404, "상담을 찾지 못했습니다.");
}

async function readSource(sourceId: string) {
  const result = await getSupabaseAdminClient().from("fashion_product_sources_v2")
    .select(SOURCE_SELECT).eq("source_id", sourceId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new HairfitV2Error("FASHION_PRODUCT_SOURCE_NOT_FOUND", 404, "상품 공급원을 찾지 못했습니다.");
  return rowSource(result.data as Row);
}

async function readCurrentOffer(offerId: string) {
  const result = await getSupabaseAdminClient().from("fashion_product_offers_v2")
    .select(OFFER_SELECT).eq("offer_id", offerId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? rowOffer(result.data as Row) : null;
}

export async function listFashionOfferSnapshotsV2(userId: string, consultationId: string) {
  await requireConsultationOwner(userId, consultationId);
  const result = await getSupabaseAdminClient().from("fashion_product_offer_snapshots_v2")
    .select(SNAPSHOT_SELECT).eq("user_id", userId).eq("consultation_id", consultationId)
    .order("recommendation_revision", { ascending: true });
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []).map((row) => rowSnapshot(row as Row));
}

export async function captureFashionOfferSnapshotsV2(input: {
  userId: string;
  consultationId: string;
  offerIds: string[];
  recommendationRevision: number;
  compatibleSizes: string[];
}) {
  await requireConsultationOwner(input.userId, input.consultationId);
  const uniqueOfferIds = [...new Set(input.offerIds)];
  const captured: FashionOfferSnapshotV1[] = [];
  for (const offerId of uniqueOfferIds) {
    const offer = await readCurrentOffer(offerId);
    if (!offer) throw new HairfitV2Error("FASHION_OFFER_NOT_FOUND", 404, "상품 offer를 찾지 못했습니다.");
    const source = await readSource(offer.sourceId);
    const eligibility = evaluateRegisteredFashionOfferV1(offer, source, {
      now: new Date().toISOString(),
      compatibleSizes: input.compatibleSizes,
      maxFreshnessMinutes: 1440,
    });
    if (!eligibility.eligible) {
      throw new HairfitV2Error("FASHION_OFFER_INELIGIBLE", 409, `추천할 수 없는 상품입니다: ${eligibility.reasonCodes.join(",")}`);
    }
    const inserted = await getSupabaseAdminClient().from("fashion_product_offer_snapshots_v2").upsert({
      consultation_id: input.consultationId,
      user_id: input.userId,
      offer_id: offer.offerId,
      recommendation_revision: input.recommendationRevision,
      offer_payload: offer,
      eligibility_reason_codes: eligibility.reasonCodes,
      policy_version: "fashion-product-truth-v1",
    }, { onConflict: "consultation_id,recommendation_revision,offer_id", ignoreDuplicates: true })
      .select(SNAPSHOT_SELECT).single();
    if (inserted.error) {
      const replay = await getSupabaseAdminClient().from("fashion_product_offer_snapshots_v2").select(SNAPSHOT_SELECT)
        .eq("consultation_id", input.consultationId).eq("recommendation_revision", input.recommendationRevision)
        .eq("offer_id", offer.offerId).maybeSingle();
      if (replay.error || !replay.data) throw new Error(inserted.error.message);
      captured.push(rowSnapshot(replay.data as Row));
    } else {
      captured.push(rowSnapshot(inserted.data as Row));
    }
  }
  return captured;
}

export async function revalidateFashionOfferSnapshotsV2(userId: string, consultationId: string, compatibleSizes: string[]) {
  const snapshots = await listFashionOfferSnapshotsV2(userId, consultationId);
  const checkedAt = new Date().toISOString();
  const results: FashionOfferRevalidationV1[] = [];
  for (const snapshot of snapshots) {
    const current = await readCurrentOffer(snapshot.offerId);
    const source = current ? await readSource(current.sourceId) : null;
    const eligibility = current && source ? evaluateRegisteredFashionOfferV1(current, source, {
      now: checkedAt,
      compatibleSizes,
      maxFreshnessMinutes: 1440,
    }) : { eligible: false, reasonCodes: ["offer-missing"] };
    results.push({
      snapshotId: snapshot.snapshotId,
      state: classifyFashionOfferRevalidation(snapshot, current, eligibility.eligible),
      checkedAt,
      currentOffer: eligibility.eligible ? current : null,
      reasonCodes: eligibility.reasonCodes,
    });
  }
  return results;
}

export async function replaceFashionOfferSnapshotV2(input: {
  userId: string;
  consultationId: string;
  snapshotId: string;
  compatibleSizes: string[];
}) {
  await requireConsultationOwner(input.userId, input.consultationId);
  const db = getSupabaseAdminClient();
  const originalResult = await db.from("fashion_product_offer_snapshots_v2").select(SNAPSHOT_SELECT)
    .eq("id", input.snapshotId).eq("consultation_id", input.consultationId).eq("user_id", input.userId).maybeSingle();
  if (originalResult.error) throw new Error(originalResult.error.message);
  if (!originalResult.data) throw new HairfitV2Error("FASHION_OFFER_SNAPSHOT_NOT_FOUND", 404, "추천 상품 기록을 찾지 못했습니다.");
  const original = rowSnapshot(originalResult.data as Row);
  const replay = await db.from("fashion_product_offer_snapshots_v2").select(SNAPSHOT_SELECT)
    .eq("replacement_of_snapshot_id", input.snapshotId).maybeSingle();
  if (replay.error) throw new Error(replay.error.message);
  if (replay.data) return rowSnapshot(replay.data as Row);

  const offers = await db.from("fashion_product_offers_v2").select(OFFER_SELECT)
    .neq("offer_id", original.offerId).order("observed_at", { ascending: false }).limit(100);
  if (offers.error) throw new Error(offers.error.message);
  for (const row of offers.data ?? []) {
    const offer = await rowOffer(row as Row);
    if (offer.category !== original.category) continue;
    const source = await readSource(offer.sourceId);
    const eligibility = evaluateRegisteredFashionOfferV1(offer, source, {
      now: new Date().toISOString(), compatibleSizes: input.compatibleSizes, maxFreshnessMinutes: 1440,
    });
    if (!eligibility.eligible) continue;
    const inserted = await db.from("fashion_product_offer_snapshots_v2").insert({
      consultation_id: input.consultationId,
      user_id: input.userId,
      offer_id: offer.offerId,
      recommendation_revision: original.recommendationRevision + 1,
      replacement_of_snapshot_id: original.snapshotId,
      offer_payload: offer,
      eligibility_reason_codes: eligibility.reasonCodes,
      policy_version: "fashion-product-truth-v1",
    }).select(SNAPSHOT_SELECT).single();
    if (inserted.error) throw new Error(inserted.error.message);
    return rowSnapshot(inserted.data as Row);
  }
  throw new HairfitV2Error("FASHION_OFFER_REPLACEMENT_UNAVAILABLE", 409, "현재 구매 가능한 대체 상품을 찾지 못했습니다.");
}

export async function getFashionOfferCardsV2(userId: string, consultationId: string) {
  const snapshots = await listFashionOfferSnapshotsV2(userId, consultationId);
  return Promise.all(snapshots.map(async (snapshot) => {
    const source = await readSource(snapshot.sourceId);
    return {
      snapshot,
      disclosure: buildFashionProductDisclosureV1(snapshot, source),
      imageUrl: source.imageUsagePolicy === "none" ? null : snapshot.imageUrl,
      commerceNotice: "재고와 가격은 확인 시각 이후 변경될 수 있습니다.",
      simulationNotice: "추천 상품과 AI 시뮬레이션 이미지는 서로 다른 자료입니다.",
    };
  }));
}

export async function registerFashionProductSourceV2(value: unknown) {
  if (!value || typeof value !== "object") throw new HairfitV2Error("FASHION_SOURCE_INVALID", 400, "공급원 정보가 필요합니다.");
  const raw = value as Record<string, unknown>;
  if (!["official-api","partner-feed","seller-export","verified-manual"].includes(String(raw.sourceType))) {
    throw new HairfitV2Error("FASHION_SOURCE_TYPE_INVALID", 400, "지원하지 않는 공급원 유형입니다.");
  }
  const allowedHosts = Array.isArray(raw.allowedHosts) ? [...new Set(raw.allowedHosts.map(String).map((v) => v.toLowerCase().trim()).filter(Boolean))] : [];
  if (!allowedHosts.length) throw new HairfitV2Error("FASHION_SOURCE_HOSTS_REQUIRED", 400, "허용 호스트가 필요합니다.");
  const sourceId = String(raw.sourceId ?? "").trim();
  const sellerId = String(raw.sellerId ?? "").trim();
  if (!sourceId || !sellerId) throw new HairfitV2Error("FASHION_SOURCE_IDENTITY_REQUIRED", 400, "공급원과 판매자 식별자가 필요합니다.");
  const saved = await getSupabaseAdminClient().from("fashion_product_sources_v2").upsert({
    source_id: sourceId,
    source_type: raw.sourceType,
    seller_id: sellerId,
    territory: Array.isArray(raw.territory) ? raw.territory.map(String) : ["KR"],
    allowed_hosts: allowedHosts,
    refresh_sla_minutes: Math.max(5, Math.min(1440, Number(raw.refreshSlaMinutes) || 60)),
    image_usage_policy: ["link","licensed-cache","none"].includes(String(raw.imageUsagePolicy)) ? raw.imageUsagePolicy : "none",
    affiliate_disclosure_required: raw.affiliateDisclosureRequired === true,
    enabled: raw.enabled === true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "source_id" }).select(SOURCE_SELECT).single();
  if (saved.error) throw new Error(saved.error.message);
  return rowSource(saved.data as Row);
}

export async function rebuildFashionProductSourceV2(input: {
  sourceId: string;
  actorUserId: string;
  idempotencyKey: string;
  offers: unknown[];
}) {
  const source = await readSource(input.sourceId);
  if (source.sourceType !== "verified-manual" && input.offers.length > 0) {
    throw new HairfitV2Error("FASHION_SOURCE_ADAPTER_REQUIRED", 409, "계약된 공급자 adapter가 연결되지 않았습니다.");
  }
  if (source.quarantinedAt) throw new HairfitV2Error("FASHION_SOURCE_QUARANTINED", 409, "격리된 공급원입니다.");
  const db = getSupabaseAdminClient();
  const existing = await db.from("fashion_product_source_runs_v2").select("*")
    .eq("source_id", input.sourceId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;
  const run = await db.from("fashion_product_source_runs_v2").insert({
    source_id: input.sourceId, requested_by_user_id: input.actorUserId, idempotency_key: input.idempotencyKey,
    state: "running", received_count: input.offers.length, started_at: new Date().toISOString(),
  }).select("*").single();
  if (run.error) throw new Error(run.error.message);
  let accepted = 0;
  let rejected = 0;
  const fingerprints: string[] = [];
  for (const raw of input.offers) {
    try {
      const offer = normalizeFashionProductOfferV1(raw, source);
      const product = await db.from("fashion_products_v2").upsert({
        canonical_product_id: offer.canonicalProductId, brand_name: offer.brandName, product_name: offer.productName,
        category: offer.category, color_family: offer.colorFamily, material_tags: offer.materialTags, updated_at: new Date().toISOString(),
      }, { onConflict: "canonical_product_id" }).select("id").single();
      if (product.error) throw new Error(product.error.message);
      const saved = await db.from("fashion_product_offers_v2").upsert({
        offer_id: offer.offerId, source_id: offer.sourceId, seller_id: offer.sellerId, seller_product_id: offer.sellerProductId,
        product_id: product.data.id, size_system: offer.sizeSystem, available_sizes: offer.availableSizes,
        price_amount: offer.price.amount, list_price_amount: offer.listPrice?.amount ?? null, currency: "KRW",
        availability: offer.availability, ships_to_korea: offer.shipsToKorea, product_url: offer.productUrl,
        image_url: offer.imageUrl, observed_at: offer.observedAt, expires_at: offer.expiresAt,
        source_fingerprint: offer.sourceFingerprint, updated_at: new Date().toISOString(),
      }, { onConflict: "offer_id" });
      if (saved.error) throw new Error(saved.error.message);
      accepted += 1;
      fingerprints.push(offer.sourceFingerprint);
    } catch {
      rejected += 1;
    }
  }
  const receiptHash = fingerprints.length
    ? `sha256:${createHash("sha256").update(fingerprints.sort().join(":")).digest("hex")}`
    : null;
  const finished = new Date().toISOString();
  const complete = await db.from("fashion_product_source_runs_v2").update({
    state: accepted > 0 || input.offers.length === 0 ? "succeeded" : "failed",
    accepted_count: accepted, rejected_count: rejected, receipt_hash: receiptHash,
    error_code: accepted === 0 && input.offers.length > 0 ? "ALL_OFFERS_REJECTED" : null,
    error_message: accepted === 0 && input.offers.length > 0 ? "모든 상품이 검증에서 제외되었습니다." : null,
    finished_at: finished,
  }).eq("id", String((run.data as Row).id)).select("*").single();
  if (complete.error) throw new Error(complete.error.message);
  if (accepted > 0) {
    const health = await db.from("fashion_product_sources_v2").update({
      last_healthy_at: finished, updated_at: finished,
    }).eq("source_id", input.sourceId);
    if (health.error) throw new Error(health.error.message);
  }
  return complete.data;
}

export async function getFashionProductSourceHealthV2(sourceId: string) {
  const [source, runs] = await Promise.all([
    readSource(sourceId),
    getSupabaseAdminClient().from("fashion_product_source_runs_v2").select("*")
      .eq("source_id", sourceId).order("created_at", { ascending: false }).limit(20),
  ]);
  if (runs.error) throw new Error(runs.error.message);
  return { source, runs: runs.data ?? [], adapterConnected: source.sourceType === "verified-manual" };
}

export async function quarantineFashionProductSourceV2(sourceId: string, reason: string) {
  if (!reason.trim()) throw new HairfitV2Error("FASHION_SOURCE_QUARANTINE_REASON_REQUIRED", 400, "격리 사유가 필요합니다.");
  const now = new Date().toISOString();
  const result = await getSupabaseAdminClient().from("fashion_product_sources_v2").update({
    enabled: false, quarantined_at: now, quarantine_reason: reason.trim(), updated_at: now,
  }).eq("source_id", sourceId).select(SOURCE_SELECT).single();
  if (result.error) throw new Error(result.error.message);
  return rowSource(result.data as Row);
}
