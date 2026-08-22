import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  projectConsultationReportV1,
  type ConsultationReportProfileV1,
  type ConsultationReportViewModelV1,
} from "@hairfit/shared/consulting/report";
import type {
  ConsultationReportImageV2,
  ConsultationReportProfileV2,
  ConsultationReportViewModelV2,
} from "@hairfit/shared/consulting/report-v2";
import { getSupabaseAdminClient } from "../supabase";
import { readServerConsultation } from "./server-store";
import { renderConsultationReportPdfWithWorker } from "./report-pdf-worker";
import { readConsultationReportV2 } from "./report-v2-server";

const REPORT_BUCKET = "consultation-report-exports";
const REPORT_TTL_MS = 24 * 60 * 60 * 1000;

interface ReportSnapshotRow {
  id: string;
  view_model: ConsultationReportViewModelV1 | ConsultationReportViewModelV2;
  content_sha256: string;
  source_fingerprint: string;
  view_model_version: 1 | 2;
  renderer_version: "report-pdf-v1" | "report-pdf-v2";
}

interface ReportExportRow {
  id: string;
  consultation_id: string;
  report_snapshot_id: string;
  user_id: string;
  status: "queued" | "rendering" | "ready" | "failed" | "expired";
  storage_bucket: string | null;
  storage_path: string | null;
  file_sha256: string | null;
  byte_size: number | null;
  error_code: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function ownerPrefix(userId: string) {
  return sha256(userId).slice(0, 32);
}

function allowedReportImageHosts() {
  const hosts = new Set<string>();
  for (const value of [process.env.NEXT_PUBLIC_SUPABASE_URL, ...(process.env.CONSULTATION_REPORT_IMAGE_HOSTS ?? "").split(",")]) {
    const candidate = value?.trim();
    if (!candidate) continue;
    try {
      hosts.add(candidate.includes("://") ? new URL(candidate).host : candidate);
    } catch {
      // An invalid operator allow-list entry grants no access.
    }
  }
  return hosts;
}

function allowReportImageUrl(source: string | null, hosts: Set<string>) {
  if (!source) return null;
  try {
    const url = new URL(source);
    const localDevelopment = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localDevelopment) || url.username || url.password || !hosts.has(url.host) && !localDevelopment) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function secureReportImages(report: ConsultationReportViewModelV1): ConsultationReportViewModelV1 {
  const hosts = allowedReportImageHosts();
  const secureImage = (image: NonNullable<ConsultationReportViewModelV1["heroImage"]>) => {
    const src = allowReportImageUrl(image.src, hosts);
    return { ...image, src, status: src ? image.status : "failed" as const };
  };
  return {
    ...report,
    heroImage: report.heroImage ? secureImage(report.heroImage) : null,
    sections: report.sections.map((item) => ({ ...item, images: item.images.map(secureImage) })),
  };
}

function secureReportImagesV2(report: ConsultationReportViewModelV2): ConsultationReportViewModelV2 {
  const hosts = allowedReportImageHosts();
  const secureImage = (image: ConsultationReportImageV2 | null) => {
    if (!image) return null;
    const src = allowReportImageUrl(image.src, hosts);
    return { ...image, src, status: src ? image.status : "failed" as const };
  };
  return {
    ...report,
    tabs: report.tabs.map((tab) => ({
      ...tab,
      sections: tab.sections.map((section) => {
        switch (section.key) {
          case "candidate-comparison":
            return { ...section, payload: { ...section.payload, candidates: section.payload.candidates.map((candidate) => ({ ...candidate, image: secureImage(candidate.image)! })) } };
          case "final-hair":
            return { ...section, payload: { ...section.payload, image: secureImage(section.payload.image)! } };
          case "final-color":
            return { ...section, payload: { ...section.payload, image: secureImage(section.payload.image) } };
          case "makeup-result":
            return { ...section, payload: { ...section.payload, moodImage: secureImage(section.payload.moodImage) } };
          case "fashion-result":
            return { ...section, payload: { ...section.payload, looks: section.payload.looks.map((look) => ({ ...look, image: secureImage(look.image) })) } };
          case "executive-summary":
            return { ...section, payload: { ...section.payload, heroImage: secureImage(section.payload.heroImage) } };
          default:
            return section;
        }
      }),
    })),
  };
}

function normalizeExport(row: ReportExportRow) {
  return {
    id: row.id,
    consultationId: row.consultation_id,
    reportSnapshotId: row.report_snapshot_id,
    status: row.status,
    downloadAvailable: row.status === "ready" && new Date(row.expires_at).getTime() > Date.now(),
    fileSha256: row.file_sha256,
    byteSize: row.byte_size,
    errorCode: row.error_code,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertExportVersionScope(row: ReportExportRow, viewModelVersion: 1 | 2) {
  const snapshot = await getSupabaseAdminClient().from("consultation_report_snapshots_v2")
    .select("view_model_version")
    .eq("id", row.report_snapshot_id)
    .eq("user_id", row.user_id)
    .maybeSingle();
  if (snapshot.error) throw new Error(snapshot.error.message);
  if (!snapshot.data || Number((snapshot.data as { view_model_version?: unknown }).view_model_version) !== viewModelVersion) {
    throw new Error("IDEMPOTENCY_SCOPE_CONFLICT");
  }
}

async function readOrCreateReportSnapshot(input: {
  userId: string;
  consultationId: string;
  expectedResultVersion: number;
  profile: ConsultationReportProfileV1 | ConsultationReportProfileV2;
  viewModelVersion: 1 | 2;
}) {
  const snapshot = await readServerConsultation(input.userId, input.consultationId);
  if (!snapshot) throw new Error("NOT_FOUND");
  if (snapshot.result.version !== input.expectedResultVersion) throw new Error("REPORT_VERSION_CONFLICT");

  const db = getSupabaseAdminClient();
  const projectedV2 = input.viewModelVersion === 2
    ? await readConsultationReportV2({ userId: input.userId, consultationId: input.consultationId, snapshot, profile: input.profile, surface: "pdf" })
    : null;
  if (input.viewModelVersion === 2 && !projectedV2) throw new Error("NOT_FOUND");
  const projected = projectedV2
    ? secureReportImagesV2(projectedV2)
    : secureReportImages(projectConsultationReportV1(snapshot, input.profile));
  const sourceFingerprint = projectedV2 ? projectedV2.provenance.fingerprint : "legacy-v1";
  const existing = await db.from("consultation_report_snapshots_v2")
    .select("id,view_model,content_sha256,source_fingerprint,view_model_version,renderer_version")
    .eq("consultation_id", input.consultationId)
    .eq("user_id", input.userId)
    .eq("consultation_version", snapshot.version)
    .eq("result_version", snapshot.result.version)
    .eq("profile", input.profile)
    .eq("view_model_version", input.viewModelVersion)
    .eq("renderer_version", input.viewModelVersion === 2 ? "report-pdf-v2" : "report-pdf-v1")
    .eq("source_fingerprint", sourceFingerprint)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data as unknown as ReportSnapshotRow;

  const fingerprintSource = { ...projected, integrityCode: "sha256-pending" };
  const contentSha256 = sha256(stable(fingerprintSource));
  const viewModel = { ...projected, integrityCode: contentSha256.slice(0, 12) };
  const id = randomUUID();
  const inserted = await db.from("consultation_report_snapshots_v2").insert({
    id,
    consultation_id: input.consultationId,
    user_id: input.userId,
    result_snapshot_id: snapshot.result.id,
    profile: input.profile,
    consultation_version: snapshot.version,
    result_version: snapshot.result.version,
    view_model: viewModel,
    content_sha256: contentSha256,
    source_fingerprint: sourceFingerprint,
    view_model_version: input.viewModelVersion,
    renderer_version: input.viewModelVersion === 2 ? "report-pdf-v2" : "report-pdf-v1",
  }).select("id,view_model,content_sha256,source_fingerprint,view_model_version,renderer_version").single();
  if (inserted.error?.code === "23505") {
    const replay = await db.from("consultation_report_snapshots_v2")
      .select("id,view_model,content_sha256,source_fingerprint,view_model_version,renderer_version")
      .eq("consultation_id", input.consultationId)
      .eq("user_id", input.userId)
      .eq("consultation_version", snapshot.version)
      .eq("result_version", snapshot.result.version)
      .eq("profile", input.profile)
      .eq("view_model_version", input.viewModelVersion)
      .eq("renderer_version", input.viewModelVersion === 2 ? "report-pdf-v2" : "report-pdf-v1")
      .eq("source_fingerprint", sourceFingerprint)
      .single();
    if (replay.error) throw new Error(replay.error.message);
    return replay.data as unknown as ReportSnapshotRow;
  }
  if (inserted.error) throw new Error(inserted.error.message);
  return inserted.data as unknown as ReportSnapshotRow;
}

export async function createConsultationReportExport(input: {
  userId: string;
  consultationId: string;
  idempotencyKey: string;
  expectedResultVersion: number;
  profile: ConsultationReportProfileV1 | ConsultationReportProfileV2;
  viewModelVersion: 1 | 2;
}) {
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 200) throw new Error("INVALID_IDEMPOTENCY_KEY");
  const db = getSupabaseAdminClient();
  const replay = await db.from("consultation_report_exports_v2")
    .select("id,consultation_id,report_snapshot_id,user_id,status,storage_bucket,storage_path,file_sha256,byte_size,error_code,expires_at,created_at,updated_at")
    .eq("user_id", input.userId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (replay.error) throw new Error(replay.error.message);
  if (replay.data) {
    const row = replay.data as unknown as ReportExportRow;
    if (row.consultation_id !== input.consultationId) throw new Error("IDEMPOTENCY_SCOPE_CONFLICT");
    await assertExportVersionScope(row, input.viewModelVersion);
    return normalizeExport(row);
  }

  const reportSnapshot = await readOrCreateReportSnapshot(input);
  const exportId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REPORT_TTL_MS).toISOString();
  const objectPath = `${ownerPrefix(input.userId)}/${input.consultationId}/${reportSnapshot.id}/${exportId}.pdf`;
  const created = await db.from("consultation_report_exports_v2").insert({
    id: exportId,
    consultation_id: input.consultationId,
    report_snapshot_id: reportSnapshot.id,
    user_id: input.userId,
    idempotency_key: input.idempotencyKey,
    status: "rendering",
    expires_at: expiresAt,
  }).select("id,consultation_id,report_snapshot_id,user_id,status,storage_bucket,storage_path,file_sha256,byte_size,error_code,expires_at,created_at,updated_at").single();
  if (created.error?.code === "23505") {
    const duplicate = await db.from("consultation_report_exports_v2")
      .select("id,consultation_id,report_snapshot_id,user_id,status,storage_bucket,storage_path,file_sha256,byte_size,error_code,expires_at,created_at,updated_at")
      .eq("user_id", input.userId).eq("idempotency_key", input.idempotencyKey).single();
    if (duplicate.error) throw new Error(duplicate.error.message);
    const row = duplicate.data as unknown as ReportExportRow;
    if (row.consultation_id !== input.consultationId) throw new Error("IDEMPOTENCY_SCOPE_CONFLICT");
    await assertExportVersionScope(row, input.viewModelVersion);
    return normalizeExport(row);
  }
  if (created.error) throw new Error(created.error.message);

  try {
    const pdf = await renderConsultationReportPdfWithWorker(reportSnapshot.view_model);
    const upload = await db.storage.from(REPORT_BUCKET).upload(objectPath, pdf, { contentType: "application/pdf", upsert: false });
    if (upload.error) throw new Error(upload.error.message);
    const fileSha256 = sha256(pdf);
    const ready = await db.from("consultation_report_exports_v2").update({
      status: "ready",
      storage_bucket: REPORT_BUCKET,
      storage_path: objectPath,
      file_sha256: fileSha256,
      byte_size: pdf.byteLength,
      updated_at: new Date().toISOString(),
    }).eq("id", exportId).eq("user_id", input.userId)
      .select("id,consultation_id,report_snapshot_id,user_id,status,storage_bucket,storage_path,file_sha256,byte_size,error_code,expires_at,created_at,updated_at").single();
    if (ready.error) throw new Error(ready.error.message);
    return normalizeExport(ready.data as unknown as ReportExportRow);
  } catch (error) {
    await db.from("consultation_report_exports_v2").update({
      status: "failed",
      error_code: error instanceof Error ? error.message.slice(0, 120) : "REPORT_RENDER_FAILED",
      updated_at: new Date().toISOString(),
    }).eq("id", exportId).eq("user_id", input.userId);
    throw error;
  }
}

export async function getConsultationReportExport(userId: string, consultationId: string, exportId: string) {
  const result = await getSupabaseAdminClient().from("consultation_report_exports_v2")
    .select("id,consultation_id,report_snapshot_id,user_id,status,storage_bucket,storage_path,file_sha256,byte_size,error_code,expires_at,created_at,updated_at")
    .eq("id", exportId).eq("consultation_id", consultationId).eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("NOT_FOUND");
  return normalizeExport(result.data as unknown as ReportExportRow);
}

export async function downloadConsultationReportExport(userId: string, consultationId: string, exportId: string) {
  const db = getSupabaseAdminClient();
  const result = await db.from("consultation_report_exports_v2")
    .select("id,consultation_id,report_snapshot_id,user_id,status,storage_bucket,storage_path,file_sha256,byte_size,error_code,expires_at,created_at,updated_at")
    .eq("id", exportId).eq("consultation_id", consultationId).eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("NOT_FOUND");
  const row = result.data as unknown as ReportExportRow;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.from("consultation_report_exports_v2").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", row.id).eq("user_id", userId);
    throw new Error("REPORT_EXPORT_EXPIRED");
  }
  if (row.status !== "ready" || !row.storage_bucket || !row.storage_path) throw new Error("REPORT_EXPORT_NOT_READY");
  const file = await db.storage.from(row.storage_bucket).download(row.storage_path);
  if (file.error) throw new Error(file.error.message);
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  if (new TextDecoder("ascii").decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("INVALID_PDF_OUTPUT");
  if (row.file_sha256 && sha256(bytes) !== row.file_sha256) throw new Error("REPORT_EXPORT_INTEGRITY_MISMATCH");
  return { bytes, filename: `HairFit-consultation-${consultationId.slice(0, 8)}.pdf`, sha256: row.file_sha256 };
}
