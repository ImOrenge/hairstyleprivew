import "server-only";

import type {
  CustomerStylebookCollectionColorV2,
  CustomerStylebookCollectionV2,
  CustomerStylebookItemKindV2,
  CustomerStylebookItemStateV2,
  CustomerStylebookReferenceV2,
  CustomerStylebookSetV2,
  CustomerStylebookShareV2,
  CustomerStylebookV2,
  CustomerStylebookWearLogV2,
} from "@hairfit/shared";
import {
  createSignedUrl,
  type ServerSupabaseLike,
} from "../style-profile-server";
import { getSupabaseAdminClient } from "../supabase";

export const STYLEBOOK_WEAR_PHOTOS_BUCKET = "stylebook-wear-photos";

type QueryError = { code?: string; message: string } | null;

type ItemStateRow = {
  item_kind: string;
  source_id: string;
  custom_title: string | null;
  note: string;
  tags: unknown;
  is_favorite: boolean;
  archived_at: string | null;
  updated_at: string;
};

type CollectionRow = {
  id: string;
  name: string;
  color_key: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type CollectionItemRow = {
  collection_id: string;
  item_kind: string;
  source_id: string;
  consultation_id: string;
};

type WearLogRow = {
  id: string;
  item_kind: string;
  source_id: string;
  consultation_id: string;
  applied_on: string;
  application_type: string;
  satisfaction: number;
  convenience: number;
  reaction_note: string;
  note: string;
  would_repeat: boolean;
  photo_path: string | null;
  photo_consent_at: string | null;
  created_at: string;
  updated_at: string;
};

type ShareRow = {
  id: string;
  item_kind: string;
  source_id: string;
  consultation_id: string;
  include_private_note: boolean;
  include_actual_photo: boolean;
  expires_at: string;
  created_at: string;
};

type ReferenceRow = {
  id: string;
  source_item_kind: string;
  source_item_id: string;
  source_consultation_id: string;
  new_consultation_id: string;
  created_at: string;
};

const ITEM_KINDS = new Set<CustomerStylebookItemKindV2>(["hair", "fashion"]);
const COLLECTION_COLORS = new Set<CustomerStylebookCollectionColorV2>([
  "champagne",
  "ivory",
  "graphite",
  "rose",
  "sage",
]);

function itemKind(value: string): CustomerStylebookItemKindV2 | null {
  return ITEM_KINDS.has(value as CustomerStylebookItemKindV2)
    ? value as CustomerStylebookItemKindV2
    : null;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
}

function itemKey(kind: CustomerStylebookItemKindV2, id: string) {
  return `${kind}:${id}`;
}

function isMissingMetadataTable(error: QueryError) {
  return error?.code === "42P01"
    || /relation .*customer_stylebook_.* does not exist/i.test(error?.message ?? "");
}

function throwQueryError(error: QueryError) {
  if (error) throw new Error(error.message);
}

export function emptyCustomerStylebookCollectionV2(): CustomerStylebookV2 {
  return {
    schemaVersion: "customer-stylebook-v2",
    hair: [],
    fashion: [],
    sets: [],
    collections: [],
    wearLogs: [],
    activeShares: [],
    references: [],
    metadataAvailable: false,
  };
}

function deriveSets(collection: CustomerStylebookV2): CustomerStylebookSetV2[] {
  const hairByConsultation = new Map(collection.hair.map((entry) => [entry.consultationId, entry]));
  return collection.fashion.flatMap((fashion) => {
    const hair = hairByConsultation.get(fashion.consultationId);
    if (!hair) return [];
    const confirmedAt = new Date(hair.confirmedAt).getTime() > new Date(fashion.confirmedAt).getTime()
      ? hair.confirmedAt
      : fashion.confirmedAt;
    return [{
      id: `${hair.id}:${fashion.id}`,
      consultationId: hair.consultationId,
      hairEntryId: hair.id,
      fashionEntryId: fashion.id,
      title: `${hair.state.customTitle ?? hair.title} · ${fashion.state.customTitle ?? fashion.title}`,
      mood: [hair.strategyBucket, fashion.genre].filter(Boolean).join(" · "),
      palette: fashion.palette,
      confirmedAt,
    }];
  });
}

export async function attachCustomerStylebookMetadataV2(
  userId: string,
  base: CustomerStylebookV2,
): Promise<CustomerStylebookV2> {
  const db = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const [states, collections, collectionItems, wearLogs, shares, references] = await Promise.all([
    db.from("customer_stylebook_item_states_v2")
      .select("item_kind,source_id,custom_title,note,tags,is_favorite,archived_at,updated_at")
      .eq("user_id", userId)
      .limit(500),
    db.from("customer_stylebook_collections_v2")
      .select("id,name,color_key,sort_order,created_at,updated_at")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(100),
    db.from("customer_stylebook_collection_items_v2")
      .select("collection_id,item_kind,source_id,consultation_id")
      .eq("user_id", userId)
      .limit(1000),
    db.from("customer_stylebook_wear_logs_v2")
      .select("id,item_kind,source_id,consultation_id,applied_on,application_type,satisfaction,convenience,reaction_note,note,would_repeat,photo_path,photo_consent_at,created_at,updated_at")
      .eq("user_id", userId)
      .order("applied_on", { ascending: false })
      .limit(300),
    db.from("customer_stylebook_shares_v2")
      .select("id,item_kind,source_id,consultation_id,include_private_note,include_actual_photo,expires_at,created_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("customer_stylebook_consultation_references_v2")
      .select("id,source_item_kind,source_item_id,source_consultation_id,new_consultation_id,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const results = [states, collections, collectionItems, wearLogs, shares, references];
  if (results.some((result) => isMissingMetadataTable(result.error))) {
    return { ...base, sets: deriveSets(base), metadataAvailable: false };
  }
  results.forEach((result) => throwQueryError(result.error));

  const stateByItem = new Map<string, CustomerStylebookItemStateV2>();
  for (const row of (states.data ?? []) as unknown as ItemStateRow[]) {
    const kind = itemKind(row.item_kind);
    if (!kind || !row.source_id) continue;
    stateByItem.set(itemKey(kind, row.source_id), {
      customTitle: row.custom_title?.trim() || null,
      note: row.note?.trim() || "",
      tags: strings(row.tags),
      favorite: row.is_favorite === true,
      archivedAt: row.archived_at,
      updatedAt: row.updated_at,
    });
  }

  const withState: CustomerStylebookV2 = {
    ...base,
    hair: base.hair.map((entry) => ({ ...entry, state: stateByItem.get(itemKey("hair", entry.id)) ?? entry.state })),
    fashion: base.fashion.map((entry) => ({ ...entry, state: stateByItem.get(itemKey("fashion", entry.id)) ?? entry.state })),
    metadataAvailable: true,
  };

  const itemRows = (collectionItems.data ?? []) as unknown as CollectionItemRow[];
  const collectionValues: CustomerStylebookCollectionV2[] = ((collections.data ?? []) as unknown as CollectionRow[]).map((row) => ({
    id: row.id,
    name: row.name.trim(),
    colorKey: COLLECTION_COLORS.has(row.color_key as CustomerStylebookCollectionColorV2)
      ? row.color_key as CustomerStylebookCollectionColorV2
      : "champagne",
    sortOrder: row.sort_order,
    itemRefs: itemRows.flatMap((item) => {
      const kind = itemKind(item.item_kind);
      return item.collection_id === row.id && kind
        ? [{ kind, id: item.source_id, consultationId: item.consultation_id }]
        : [];
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const photoPaths = [...new Set(((wearLogs.data ?? []) as unknown as WearLogRow[])
    .map((row) => row.photo_path)
    .filter((path): path is string => Boolean(path)))];
  const photoUrls = new Map(await Promise.all(photoPaths.map(async (path) => [
    path,
    await createSignedUrl(db as unknown as ServerSupabaseLike, STYLEBOOK_WEAR_PHOTOS_BUCKET, path),
  ] as const)));

  const wearLogValues: CustomerStylebookWearLogV2[] = ((wearLogs.data ?? []) as unknown as WearLogRow[]).flatMap((row) => {
    const kind = itemKind(row.item_kind);
    if (!kind || !["hair_service", "outfit_worn", "other"].includes(row.application_type)) return [];
    return [{
      id: row.id,
      item: { kind, id: row.source_id, consultationId: row.consultation_id },
      appliedOn: row.applied_on,
      applicationType: row.application_type as CustomerStylebookWearLogV2["applicationType"],
      satisfaction: row.satisfaction,
      convenience: row.convenience,
      reactionNote: row.reaction_note ?? "",
      note: row.note ?? "",
      wouldRepeat: row.would_repeat,
      photoUrl: row.photo_path ? photoUrls.get(row.photo_path) ?? null : null,
      photoConsentedAt: row.photo_consent_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }];
  });

  const shareValues: CustomerStylebookShareV2[] = ((shares.data ?? []) as unknown as ShareRow[]).flatMap((row) => {
    const kind = itemKind(row.item_kind);
    return kind ? [{
      id: row.id,
      item: { kind, id: row.source_id, consultationId: row.consultation_id },
      includePrivateNote: row.include_private_note,
      includeActualPhoto: row.include_actual_photo,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }] : [];
  });

  const referenceValues: CustomerStylebookReferenceV2[] = ((references.data ?? []) as unknown as ReferenceRow[]).flatMap((row) => {
    const kind = itemKind(row.source_item_kind);
    return kind ? [{
      id: row.id,
      source: { kind, id: row.source_item_id, consultationId: row.source_consultation_id },
      newConsultationId: row.new_consultation_id,
      createdAt: row.created_at,
    }] : [];
  });

  return {
    ...withState,
    sets: deriveSets(withState),
    collections: collectionValues,
    wearLogs: wearLogValues,
    activeShares: shareValues,
    references: referenceValues,
  };
}
