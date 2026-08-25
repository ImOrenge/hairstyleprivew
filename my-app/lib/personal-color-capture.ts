import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { loadSharp } from "./sharp-loader.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PERSONAL_COLOR_CAPTURE_ROLES_V2,
  type PersonalColorAssetCaptureModeV2,
  type PersonalColorCaptureAssetV2,
  type PersonalColorCaptureMetadataV2,
  type PersonalColorCaptureRoleV2,
  type PersonalColorCaptureUploadIntentV2,
} from "@hairfit/shared/personal-color-v2";
import type { PhotoFaceDetectionEvidence } from "@hairfit/shared";
import { getSupabaseAdminClient } from "./supabase";
import { assessPersonalColorCaptureQuality } from "./personal-color-capture-quality";

export const PERSONAL_COLOR_CAPTURE_BUCKET = "private-color-inputs";
const MAX_CAPTURE_BYTES = 10 * 1024 * 1024;
const CAPTURE_TTL_MS = 24 * 60 * 60 * 1000;
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CaptureRow = {
  id: string;
  consultation_id: string;
  role: PersonalColorCaptureRoleV2;
  capture_mode: PersonalColorAssetCaptureModeV2;
  storage_bucket: string;
  storage_path: string;
  content_type: PersonalColorCaptureMetadataV2["contentType"];
  byte_size: number;
  checksum_sha256: string;
  metadata: PersonalColorCaptureMetadataV2;
  quality: PersonalColorCaptureAssetV2["quality"];
  status: PersonalColorCaptureAssetV2["status"];
  created_at: string;
  finalized_at: string | null;
  expires_at: string;
};

export class PersonalColorCaptureError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = "PersonalColorCaptureError";
  }
}

function extensionFor(contentType: PersonalColorCaptureMetadataV2["contentType"]) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function safeUserHash(userId: string) {
  return createHash("sha256").update(userId).digest("hex");
}

function stableLegacyConsultationId(userId: string) {
  const hex = createHash("sha256").update(`legacy-personal-color:${userId}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function normalizeContentType(value: unknown): PersonalColorCaptureMetadataV2["contentType"] {
  if (value === "image/jpeg" || value === "image/png" || value === "image/webp") return value;
  throw new PersonalColorCaptureError("CAPTURE_CONTENT_TYPE_UNSUPPORTED", 415, "JPG, PNG 또는 WebP 사진을 사용해 주세요.");
}

function assertIntentInput(input: {
  consultationId: string;
  role: PersonalColorCaptureRoleV2;
  captureMode: PersonalColorAssetCaptureModeV2;
  checksumSha256: string;
  contentType: PersonalColorCaptureMetadataV2["contentType"];
  byteSize: number;
}) {
  if (!UUID_PATTERN.test(input.consultationId)) throw new PersonalColorCaptureError("CONSULTATION_ID_INVALID", 400, "상담 ID가 올바르지 않습니다.");
  if (!PERSONAL_COLOR_CAPTURE_ROLES_V2.includes(input.role)) throw new PersonalColorCaptureError("CAPTURE_ROLE_INVALID", 400, "사진 역할이 올바르지 않습니다.");
  if (input.captureMode !== "quick" && input.captureMode !== "precision") throw new PersonalColorCaptureError("CAPTURE_MODE_INVALID", 400, "촬영 모드가 올바르지 않습니다.");
  if (!CHECKSUM_PATTERN.test(input.checksumSha256)) throw new PersonalColorCaptureError("CAPTURE_CHECKSUM_INVALID", 400, "사진 checksum이 올바르지 않습니다.");
  if (!Number.isInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > MAX_CAPTURE_BYTES) throw new PersonalColorCaptureError("CAPTURE_SIZE_INVALID", 413, "사진은 10MB 이하여야 합니다.");
  normalizeContentType(input.contentType);
}

function mapAsset(row: CaptureRow): PersonalColorCaptureAssetV2 {
  return {
    id: row.id,
    consultationId: row.consultation_id,
    role: row.role,
    captureMode: row.capture_mode,
    status: row.status,
    checksumSha256: row.checksum_sha256,
    metadata: row.metadata,
    quality: row.quality,
    createdAt: row.created_at,
    finalizedAt: row.finalized_at,
    expiresAt: row.expires_at,
  };
}

async function readOwnedConsultation(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient().from("consultation_sessions")
    .select("id").eq("id", consultationId).eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new PersonalColorCaptureError("CONSULTATION_NOT_FOUND", 404, "상담을 찾지 못했습니다.");
}

async function readCaptureByChecksum(input: {
  userId: string;
  consultationId: string;
  role: PersonalColorCaptureRoleV2;
  checksumSha256: string;
}) {
  const result = await getSupabaseAdminClient().from("personal_color_capture_assets")
    .select("*")
    .eq("user_id", input.userId)
    .eq("consultation_id", input.consultationId)
    .eq("role", input.role)
    .eq("checksum_sha256", input.checksumSha256)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as unknown as CaptureRow | null;
}

async function createIntentRecord(input: {
  userId: string;
  consultationId: string;
  role: PersonalColorCaptureRoleV2;
  captureMode: PersonalColorAssetCaptureModeV2;
  checksumSha256: string;
  contentType: PersonalColorCaptureMetadataV2["contentType"];
  byteSize: number;
}) {
  const existing = await readCaptureByChecksum(input);
  if (existing && existing.status !== "deleted") return { row: existing, replay: true };

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + CAPTURE_TTL_MS).toISOString();
  const storagePath = `${safeUserHash(input.userId)}/${input.consultationId}/${id}/${input.role}.${extensionFor(input.contentType)}`;
  const metadata: PersonalColorCaptureMetadataV2 = {
    contentType: input.contentType,
    byteSize: input.byteSize,
    width: 0,
    height: 0,
    exifOrientation: null,
    clientTransform: "none",
    sourceColorSpace: null,
  };
  const inserted = await getSupabaseAdminClient().from("personal_color_capture_assets").insert({
    id,
    consultation_id: input.consultationId,
    user_id: input.userId,
    role: input.role,
    capture_mode: input.captureMode,
    storage_bucket: PERSONAL_COLOR_CAPTURE_BUCKET,
    storage_path: storagePath,
    content_type: input.contentType,
    byte_size: input.byteSize,
    checksum_sha256: input.checksumSha256,
    metadata,
    status: "intent_created",
    expires_at: expiresAt,
  }).select("*").single();
  if (inserted.error) {
    const reconciled = await readCaptureByChecksum(input);
    if (reconciled && reconciled.status !== "deleted") return { row: reconciled, replay: true };
    throw new Error(inserted.error.message);
  }
  return { row: inserted.data as unknown as CaptureRow, replay: false };
}

export async function createPersonalColorCaptureIntent(input: {
  userId: string;
  consultationId: string;
  role: PersonalColorCaptureRoleV2;
  captureMode: PersonalColorAssetCaptureModeV2;
  checksumSha256: string;
  contentType: PersonalColorCaptureMetadataV2["contentType"];
  byteSize: number;
}): Promise<PersonalColorCaptureUploadIntentV2> {
  assertIntentInput(input);
  await readOwnedConsultation(input.userId, input.consultationId);
  const created = await createIntentRecord(input);
  const requiresUpload = created.row.status === "intent_created";
  const signed = requiresUpload
    ? await getSupabaseAdminClient().storage.from(PERSONAL_COLOR_CAPTURE_BUCKET).createSignedUploadUrl(created.row.storage_path, { upsert: false })
    : { data: null, error: null };
  if (signed.error) throw new Error(signed.error.message);
  return {
    asset: mapAsset(created.row),
    upload: {
      bucket: PERSONAL_COLOR_CAPTURE_BUCKET,
      path: created.row.storage_path,
      token: signed.data?.token ?? null,
      required: requiresUpload,
    },
    idempotentReplay: created.replay,
  };
}

function formatFromSharp(value: string | undefined) {
  if (value === "jpeg") return "image/jpeg" as const;
  if (value === "png") return "image/png" as const;
  if (value === "webp") return "image/webp" as const;
  throw new PersonalColorCaptureError("CAPTURE_MIME_MISMATCH", 415, "실제 사진 형식이 업로드 정보와 일치하지 않습니다.");
}

async function readOwnedAsset(userId: string, consultationId: string, assetId: string) {
  const result = await getSupabaseAdminClient().from("personal_color_capture_assets")
    .select("*").eq("id", assetId).eq("consultation_id", consultationId).eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new PersonalColorCaptureError("CAPTURE_NOT_FOUND", 404, "업로드 사진을 찾지 못했습니다.");
  return result.data as unknown as CaptureRow;
}

export async function finalizePersonalColorCapture(input: {
  userId: string;
  consultationId: string;
  assetId: string;
  metadata: Omit<PersonalColorCaptureMetadataV2, "contentType" | "byteSize">;
  face: PhotoFaceDetectionEvidence;
  makeupInfluence?: "low" | "possible" | "high";
}) {
  const sharp = await loadSharp();
  if (!UUID_PATTERN.test(input.assetId)) throw new PersonalColorCaptureError("CAPTURE_ID_INVALID", 400, "사진 ID가 올바르지 않습니다.");
  const row = await readOwnedAsset(input.userId, input.consultationId, input.assetId);
  if (row.status === "quality_ready" || row.status === "quality_blocked") return { asset: mapAsset(row), idempotentReplay: true };
  if (row.status !== "intent_created" && row.status !== "uploaded") throw new PersonalColorCaptureError("CAPTURE_STATE_INVALID", 409, "이 사진은 finalize할 수 없는 상태입니다.");

  const downloaded = await getSupabaseAdminClient().storage.from(PERSONAL_COLOR_CAPTURE_BUCKET).download(row.storage_path);
  if (downloaded.error || !downloaded.data) throw new PersonalColorCaptureError("CAPTURE_UPLOAD_MISSING", 409, "업로드가 완료되지 않았습니다.");
  const buffer = Buffer.from(await downloaded.data.arrayBuffer());
  if (buffer.length !== row.byte_size) throw new PersonalColorCaptureError("CAPTURE_SIZE_MISMATCH", 409, "업로드된 사진 크기가 요청 정보와 다릅니다.");
  const checksum = createHash("sha256").update(buffer).digest("hex");
  if (checksum !== row.checksum_sha256) throw new PersonalColorCaptureError("CAPTURE_CHECKSUM_MISMATCH", 409, "업로드된 사진 checksum이 다릅니다.");
  const sourceMetadata = await sharp(buffer, { failOn: "warning" }).metadata();
  const normalizedMetadata = await sharp(buffer, { failOn: "warning" }).rotate().metadata();
  const actualContentType = formatFromSharp(sourceMetadata.format);
  if (actualContentType !== row.content_type) throw new PersonalColorCaptureError("CAPTURE_MIME_MISMATCH", 415, "실제 사진 형식이 요청 정보와 다릅니다.");
  if (!normalizedMetadata.width || !normalizedMetadata.height) throw new PersonalColorCaptureError("CAPTURE_DIMENSIONS_MISSING", 400, "사진 크기를 읽지 못했습니다.");
  if (input.metadata.width !== normalizedMetadata.width || input.metadata.height !== normalizedMetadata.height) {
    throw new PersonalColorCaptureError("CAPTURE_DIMENSIONS_MISMATCH", 409, "업로드된 사진 해상도가 선택 시점과 다릅니다.");
  }

  const metadata: PersonalColorCaptureMetadataV2 = {
    ...input.metadata,
    contentType: row.content_type,
    byteSize: row.byte_size,
    exifOrientation: sourceMetadata.orientation ?? input.metadata.exifOrientation,
    sourceColorSpace: sourceMetadata.space ?? input.metadata.sourceColorSpace,
  };
  const quality = await assessPersonalColorCaptureQuality({ buffer, face: input.face, makeupInfluence: input.makeupInfluence });
  const finalizedAt = new Date().toISOString();
  const status = quality.blockers.length ? "quality_blocked" : "quality_ready";
  const updated = await getSupabaseAdminClient().from("personal_color_capture_assets").update({
    metadata,
    quality,
    status,
    finalized_at: finalizedAt,
  }).eq("id", row.id).eq("user_id", input.userId).eq("status", row.status).select("*").single();
  if (updated.error) throw new Error(updated.error.message);
  return { asset: mapAsset(updated.data as unknown as CaptureRow), idempotentReplay: false };
}

function parseLegacyDataUrl(value: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match?.[1] || !match[2]) throw new PersonalColorCaptureError("LEGACY_CAPTURE_INVALID", 400, "사진 데이터가 올바르지 않습니다.");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_CAPTURE_BYTES) throw new PersonalColorCaptureError("CAPTURE_SIZE_INVALID", 413, "사진은 10MB 이하여야 합니다.");
  return { buffer, contentType: normalizeContentType(match[1]) };
}

export async function materializeLegacyPersonalColorCapture(userId: string, imageDataUrl: string) {
  const sharp = await loadSharp();
  const parsed = parseLegacyDataUrl(imageDataUrl);
  const consultationId = stableLegacyConsultationId(userId);
  const checksumSha256 = createHash("sha256").update(parsed.buffer).digest("hex");
  const created = await createIntentRecord({
    userId,
    consultationId,
    role: "color_primary",
    captureMode: "quick",
    checksumSha256,
    contentType: parsed.contentType,
    byteSize: parsed.buffer.length,
  });
  if (created.row.status === "intent_created") {
    const uploaded = await getSupabaseAdminClient().storage.from(PERSONAL_COLOR_CAPTURE_BUCKET)
      .upload(created.row.storage_path, parsed.buffer, { contentType: parsed.contentType, upsert: false });
    if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message)) throw new Error(uploaded.error.message);
  }
  const metadata = await sharp(parsed.buffer, { failOn: "warning" }).rotate().metadata();
  if (!metadata.width || !metadata.height) throw new PersonalColorCaptureError("CAPTURE_DIMENSIONS_MISSING", 400, "사진 크기를 읽지 못했습니다.");
  return finalizePersonalColorCapture({
    userId,
    consultationId,
    assetId: created.row.id,
    metadata: {
      width: metadata.width,
      height: metadata.height,
      exifOrientation: metadata.orientation ?? null,
      clientTransform: "none",
      sourceColorSpace: metadata.space ?? null,
    },
    face: { status: "unsupported", count: null, box: null },
  });
}

export async function downloadOwnedPersonalColorCapture(input: {
  userId: string;
  consultationId: string;
  assetId: string;
}) {
  const row = await readOwnedAsset(input.userId, input.consultationId, input.assetId);
  if (row.status !== "quality_ready" && row.status !== "quality_blocked") {
    throw new PersonalColorCaptureError("CAPTURE_NOT_FINALIZED", 409, "퍼스널 컬러 사진 검증이 완료되지 않았습니다.");
  }
  const downloaded = await getSupabaseAdminClient().storage.from(PERSONAL_COLOR_CAPTURE_BUCKET).download(row.storage_path);
  if (downloaded.error || !downloaded.data) throw new PersonalColorCaptureError("CAPTURE_UPLOAD_MISSING", 410, "퍼스널 컬러 사진 보존 기간이 끝났습니다.");
  const buffer = Buffer.from(await downloaded.data.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");
  if (checksum !== row.checksum_sha256) throw new PersonalColorCaptureError("CAPTURE_CHECKSUM_MISMATCH", 409, "퍼스널 컬러 사진 무결성 검증에 실패했습니다.");
  return {
    asset: mapAsset(row),
    imageDataUrl: `data:${row.content_type};base64,${buffer.toString("base64")}`,
  };
}

type CleanupClaim = {
  claimed: boolean;
  outboxId: string;
  assetId: string;
  bucket: string;
  path: string;
  checksumSha256: string;
  leaseToken: string;
};

export async function deletePersonalColorCapture(input: { userId: string; consultationId: string; assetId: string; reason: string }) {
  await readOwnedAsset(input.userId, input.consultationId, input.assetId);
  const db = getSupabaseAdminClient() as SupabaseClient;
  const queued = await db.rpc("queue_personal_color_capture_cleanup", {
    p_asset_id: input.assetId,
    p_user_id: input.userId,
    p_reason: input.reason,
  });
  if (queued.error) throw new Error(queued.error.message);
  const leaseToken = randomUUID();
  const claimed = await db.rpc("claim_personal_color_capture_cleanup_asset", {
    p_asset_id: input.assetId,
    p_user_id: input.userId,
    p_lease_token: leaseToken,
    p_lease_seconds: 60,
  });
  if (claimed.error) throw new Error(claimed.error.message);
  const claim = claimed.data as unknown as CleanupClaim | null;
  if (claim?.claimed) {
    const removed = await db.storage.from(claim.bucket).remove([claim.path]);
    if (removed.error) {
      await db.rpc("retry_personal_color_capture_cleanup", {
        p_outbox_id: claim.outboxId,
        p_lease_token: claim.leaseToken,
        p_error: "storage_remove_failed",
        p_delay_seconds: 60,
      });
      throw new PersonalColorCaptureError("CAPTURE_CLEANUP_RETRY", 503, "사진 삭제를 접수했으며 안전하게 재시도합니다.");
    }
    const finished = await db.rpc("finish_personal_color_capture_cleanup", {
      p_outbox_id: claim.outboxId,
      p_lease_token: claim.leaseToken,
      p_reason: input.reason,
    });
    if (finished.error) throw new Error(finished.error.message);
  }
  const receipt = await db.from("personal_color_capture_deletion_receipts")
    .select("id,asset_id,checksum_sha256,reason,deleted_at")
    .eq("asset_id", input.assetId).eq("user_id", input.userId).maybeSingle();
  if (receipt.error) throw new Error(receipt.error.message);
  return { queued: !receipt.data, receipt: receipt.data ?? null };
}
