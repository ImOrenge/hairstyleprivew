import "server-only";

import type {
  CustomerStylebookCollectionColorV2,
  CustomerStylebookCollectionMutationV2,
  CustomerStylebookItemKindV2,
  CustomerStylebookItemRefV2,
  CustomerStylebookItemStatePatchV2,
  CustomerStylebookShareRequestV2,
  CustomerStylebookV2,
  CustomerStylebookWearLogRequestV2,
} from "@hairfit/shared";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServerConsultation } from "../consulting/server-store";
import { loadSharp } from "../sharp-loader.ts";
import { getSupabaseAdminClient } from "../supabase";
import { loadCustomerStylebookCollectionV2 } from "./customer-history-server";
import { STYLEBOOK_WEAR_PHOTOS_BUCKET } from "./customer-stylebook-metadata-server";

const ITEM_KINDS = new Set<CustomerStylebookItemKindV2>(["hair", "fashion"]);
const COLLECTION_COLORS = new Set<CustomerStylebookCollectionColorV2>([
  "champagne",
  "ivory",
  "graphite",
  "rose",
  "sage",
]);
const APPLICATION_TYPES = new Set(["hair_service", "outfit_worn", "other"]);
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8_000_000;

type StylebookEntry = CustomerStylebookV2["hair"][number] | CustomerStylebookV2["fashion"][number];

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function tokenHash(token: string) {
  return sha256(token);
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => cleanText(item, 40))
    .filter(Boolean))].slice(0, 20);
}

function validKind(value: unknown): value is CustomerStylebookItemKindV2 {
  return typeof value === "string" && ITEM_KINDS.has(value as CustomerStylebookItemKindV2);
}

function validColor(value: unknown): CustomerStylebookCollectionColorV2 {
  return typeof value === "string" && COLLECTION_COLORS.has(value as CustomerStylebookCollectionColorV2)
    ? value as CustomerStylebookCollectionColorV2
    : "champagne";
}

function numericRating(value: unknown) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("INVALID_RATING");
  return rating;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function ownedItem(userId: string, ref: Pick<CustomerStylebookItemRefV2, "kind" | "id">) {
  if (!validKind(ref.kind) || !ref.id) throw new Error("INVALID_ITEM");
  const collection = await loadCustomerStylebookCollectionV2(userId);
  const entry = collection[ref.kind].find((item) => item.id === ref.id) as StylebookEntry | undefined;
  if (!entry) throw new Error("ITEM_NOT_FOUND");
  return { entry, collection };
}

export async function updateCustomerStylebookItemStateV2(
  userId: string,
  patch: CustomerStylebookItemStatePatchV2,
) {
  const { entry } = await ownedItem(userId, { kind: patch.kind, id: patch.itemId });
  const db = getSupabaseAdminClient();
  const current = await db.from("customer_stylebook_item_states_v2")
    .select("custom_title,note,tags,is_favorite,archived_at")
    .eq("user_id", userId)
    .eq("item_kind", patch.kind)
    .eq("source_id", patch.itemId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const row = (current.data ?? {}) as unknown as {
    custom_title?: string | null;
    note?: string;
    tags?: unknown;
    is_favorite?: boolean;
    archived_at?: string | null;
  };
  const now = new Date().toISOString();
  const customTitle = patch.customTitle === undefined
    ? row.custom_title ?? null
    : cleanText(patch.customTitle, 80) || null;
  const note = patch.note === undefined ? row.note ?? "" : cleanText(patch.note, 2000);
  const tags = patch.tags === undefined ? cleanTags(row.tags) : cleanTags(patch.tags);
  const favorite = patch.favorite === undefined ? row.is_favorite === true : patch.favorite === true;
  const archivedAt = patch.archived === undefined
    ? row.archived_at ?? null
    : patch.archived ? now : null;
  const saved = await db.from("customer_stylebook_item_states_v2").upsert({
    user_id: userId,
    item_kind: patch.kind,
    source_id: patch.itemId,
    consultation_id: entry.consultationId,
    custom_title: customTitle,
    note,
    tags,
    is_favorite: favorite,
    archived_at: archivedAt,
    updated_at: now,
  }, { onConflict: "user_id,item_kind,source_id" })
    .select("custom_title,note,tags,is_favorite,archived_at,updated_at")
    .single();
  if (saved.error) throw new Error(saved.error.message);
  return {
    state: {
      customTitle,
      note,
      tags,
      favorite,
      archivedAt,
      updatedAt: now,
    },
  };
}

export async function mutateCustomerStylebookCollectionV2(
  userId: string,
  input: CustomerStylebookCollectionMutationV2,
) {
  const db = getSupabaseAdminClient();
  if (input.action === "create_collection") {
    const name = cleanText(input.name, 60);
    if (!name) throw new Error("INVALID_COLLECTION_NAME");
    const count = await db.from("customer_stylebook_collections_v2")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (count.error) throw new Error(count.error.message);
    if ((count.count ?? 0) >= 50) throw new Error("COLLECTION_LIMIT");
    const created = await db.from("customer_stylebook_collections_v2").insert({
      user_id: userId,
      name,
      color_key: validColor(input.colorKey),
    }).select("id,name,color_key,sort_order,created_at,updated_at").single();
    if (created.error) throw new Error(created.error.message);
    return { collection: created.data };
  }

  const collectionId = cleanText(input.collectionId, 80);
  if (!collectionId) throw new Error("INVALID_COLLECTION");
  const owned = await db.from("customer_stylebook_collections_v2")
    .select("id")
    .eq("id", collectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (owned.error) throw new Error(owned.error.message);
  if (!owned.data) throw new Error("COLLECTION_NOT_FOUND");

  if (input.action === "update_collection") {
    const name = cleanText(input.name, 60);
    if (!name) throw new Error("INVALID_COLLECTION_NAME");
    const updated = await db.from("customer_stylebook_collections_v2").update({
      name,
      color_key: validColor(input.colorKey),
      updated_at: new Date().toISOString(),
    }).eq("id", collectionId).eq("user_id", userId).select("id").maybeSingle();
    if (updated.error) throw new Error(updated.error.message);
    return { updated: Boolean(updated.data) };
  }

  if (input.action === "delete_collection") {
    const deleted = await db.from("customer_stylebook_collections_v2").delete()
      .eq("id", collectionId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (deleted.error) throw new Error(deleted.error.message);
    return { deleted: Boolean(deleted.data) };
  }

  if (input.action !== "set_collection_item" || !input.item) throw new Error("INVALID_COLLECTION_ACTION");
  const { entry } = await ownedItem(userId, input.item);
  if (input.included) {
    const inserted = await db.from("customer_stylebook_collection_items_v2").upsert({
      collection_id: collectionId,
      user_id: userId,
      item_kind: input.item.kind,
      source_id: input.item.id,
      consultation_id: entry.consultationId,
    }, { onConflict: "collection_id,item_kind,source_id" });
    if (inserted.error) throw new Error(inserted.error.message);
    return { included: true };
  }
  const removed = await db.from("customer_stylebook_collection_items_v2").delete()
    .eq("collection_id", collectionId)
    .eq("user_id", userId)
    .eq("item_kind", input.item.kind)
    .eq("source_id", input.item.id);
  if (removed.error) throw new Error(removed.error.message);
  return { included: false };
}

export async function createCustomerStylebookWearLogV2(input: {
  userId: string;
  value: CustomerStylebookWearLogRequestV2;
  file?: File | null;
  photoConsent?: boolean;
}) {
  const { entry } = await ownedItem(input.userId, input.value.item);
  if (!validDate(input.value.appliedOn)) throw new Error("INVALID_APPLIED_DATE");
  if (!APPLICATION_TYPES.has(input.value.applicationType)) throw new Error("INVALID_APPLICATION_TYPE");
  const satisfaction = numericRating(input.value.satisfaction);
  const convenience = numericRating(input.value.convenience);
  const logId = randomUUID();
  const db = getSupabaseAdminClient();
  let photoPath: string | null = null;
  let fingerprint: string | null = null;
  let photoConsentedAt: string | null = null;

  if (input.file) {
    if (!input.photoConsent) throw new Error("PHOTO_CONSENT_REQUIRED");
    if (!ALLOWED_IMAGE_TYPES.has(input.file.type)) throw new Error("INVALID_IMAGE_TYPE");
    if (input.file.size > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
    const sharp = await loadSharp();
    const output = await sharp(Buffer.from(await input.file.arrayBuffer()))
      .rotate()
      .resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();
    fingerprint = sha256(output);
    const ownerPrefix = sha256(input.userId).slice(0, 32);
    photoPath = `${ownerPrefix}/${entry.consultationId}/${logId}/${fingerprint}.webp`;
    const upload = await db.storage.from(STYLEBOOK_WEAR_PHOTOS_BUCKET).upload(photoPath, output, {
      contentType: "image/webp",
      upsert: false,
    });
    if (upload.error) throw new Error(upload.error.message);
    photoConsentedAt = new Date().toISOString();
  }

  const created = await db.from("customer_stylebook_wear_logs_v2").insert({
    id: logId,
    user_id: input.userId,
    item_kind: input.value.item.kind,
    source_id: input.value.item.id,
    consultation_id: entry.consultationId,
    applied_on: input.value.appliedOn,
    application_type: input.value.applicationType,
    satisfaction,
    convenience,
    reaction_note: cleanText(input.value.reactionNote, 500),
    note: cleanText(input.value.note, 2000),
    would_repeat: input.value.wouldRepeat !== false,
    photo_path: photoPath,
    photo_fingerprint: fingerprint,
    photo_consent_at: photoConsentedAt,
  }).select("id").single();
  if (created.error) {
    if (photoPath) await db.storage.from(STYLEBOOK_WEAR_PHOTOS_BUCKET).remove([photoPath]);
    throw new Error(created.error.message);
  }
  return { id: logId };
}

export async function deleteCustomerStylebookWearLogV2(userId: string, logId: string) {
  const db = getSupabaseAdminClient();
  const current = await db.from("customer_stylebook_wear_logs_v2")
    .select("id,photo_path")
    .eq("id", logId)
    .eq("user_id", userId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  if (!current.data) throw new Error("WEAR_LOG_NOT_FOUND");
  const row = current.data as unknown as { id: string; photo_path: string | null };
  const deleted = await db.from("customer_stylebook_wear_logs_v2").delete()
    .eq("id", logId)
    .eq("user_id", userId);
  if (deleted.error) throw new Error(deleted.error.message);
  if (row.photo_path) {
    const cleanup = await db.storage.from(STYLEBOOK_WEAR_PHOTOS_BUCKET).remove([row.photo_path]);
    if (cleanup.error) console.warn("[stylebook-wear-log] photo cleanup deferred", { logId, error: cleanup.error.message });
  }
  return { deleted: true };
}

export async function createCustomerStylebookShareV2(userId: string, input: CustomerStylebookShareRequestV2) {
  const { entry } = await ownedItem(userId, input.item);
  if (![24, 168, 720].includes(input.hours)) throw new Error("INVALID_SHARE_EXPIRY");
  const db = getSupabaseAdminClient();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + input.hours * 60 * 60 * 1000).toISOString();
  const created = await db.from("customer_stylebook_shares_v2").insert({
    user_id: userId,
    item_kind: input.item.kind,
    source_id: input.item.id,
    consultation_id: entry.consultationId,
    token_hash: tokenHash(token),
    include_private_note: input.includePrivateNote === true,
    include_actual_photo: input.includeActualPhoto === true,
    expires_at: expiresAt,
  }).select("id").single();
  if (created.error) throw new Error(created.error.message);
  return { id: String((created.data as { id: string }).id), token, expiresAt };
}

export async function revokeCustomerStylebookShareV2(userId: string, shareId: string) {
  const revokedAt = new Date().toISOString();
  const result = await getSupabaseAdminClient().from("customer_stylebook_shares_v2")
    .update({ revoked_at: revokedAt })
    .eq("id", shareId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("SHARE_NOT_FOUND");
  return { revokedAt };
}

export async function readPublicCustomerStylebookShareV2(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const db = getSupabaseAdminClient();
  const result = await db.from("customer_stylebook_shares_v2")
    .select("user_id,item_kind,source_id,include_private_note,include_actual_photo,expires_at,revoked_at")
    .eq("token_hash", tokenHash(token))
    .maybeSingle();
  if (result.error || !result.data) return null;
  const row = result.data as unknown as {
    user_id: string;
    item_kind: string;
    source_id: string;
    include_private_note: boolean;
    include_actual_photo: boolean;
    expires_at: string;
    revoked_at: string | null;
  };
  if (row.revoked_at || new Date(row.expires_at).getTime() <= Date.now() || !validKind(row.item_kind)) return null;
  const collection = await loadCustomerStylebookCollectionV2(row.user_id).catch(() => null);
  const entry = collection?.[row.item_kind].find((item) => item.id === row.source_id) as StylebookEntry | undefined;
  if (!entry) return null;
  const wearLog = row.include_actual_photo
    ? collection?.wearLogs.find((log) => log.item.kind === row.item_kind && log.item.id === row.source_id && log.photoUrl)
    : null;
  const publicItem: StylebookEntry = {
    ...entry,
    state: {
      customTitle: entry.state.customTitle,
      note: "",
      tags: [],
      favorite: false,
      archivedAt: null,
      updatedAt: null,
    },
  };
  return {
    expiresAt: row.expires_at,
    item: publicItem,
    privateNote: row.include_private_note ? entry.state.note : null,
    actualPhotoUrl: wearLog?.photoUrl ?? null,
  };
}

export async function createCustomerStylebookReferencedConsultationV2(
  userId: string,
  item: CustomerStylebookItemRefV2,
) {
  const { entry } = await ownedItem(userId, item);
  const snapshot = await createServerConsultation(
    userId,
    `stylebook-ref-${item.kind}-${item.id}-${randomUUID()}`,
  );
  const db = getSupabaseAdminClient();
  const reference = await db.from("customer_stylebook_consultation_references_v2").insert({
    user_id: userId,
    source_item_kind: item.kind,
    source_item_id: item.id,
    source_consultation_id: entry.consultationId,
    new_consultation_id: snapshot.sessionId,
  }).select("id,created_at").single();
  if (reference.error) {
    await db.from("consultation_sessions").delete().eq("id", snapshot.sessionId).eq("user_id", userId);
    throw new Error(reference.error.message);
  }
  return { snapshot, reference: reference.data };
}

export async function readCustomerStylebookReferenceV2(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient().from("customer_stylebook_consultation_references_v2")
    .select("source_item_kind,source_item_id,source_consultation_id,created_at")
    .eq("user_id", userId)
    .eq("new_consultation_id", consultationId)
    .maybeSingle();
  if (result.error?.code === "42P01") return null;
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;
  const row = result.data as unknown as {
    source_item_kind: CustomerStylebookItemKindV2;
    source_item_id: string;
    source_consultation_id: string;
    created_at: string;
  };
  const { entry } = await ownedItem(userId, { kind: row.source_item_kind, id: row.source_item_id });
  return {
    item: {
      kind: row.source_item_kind,
      id: row.source_item_id,
      consultationId: row.source_consultation_id,
      title: entry.state.customTitle ?? entry.title,
      imageUrl: entry.imageUrl,
    },
    createdAt: row.created_at,
  };
}
