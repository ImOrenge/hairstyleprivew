import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { compileMakeupArtistBriefV1, compileMakeupRoutineV1, type MakeupArtistBrief, type MakeupDirectionSnapshot, type MakeupRoutine } from "@hairfit/shared/makeup";
import { getSupabaseAdminClient } from "../supabase";
import { HairfitV2Error } from "../v2/errors";
import { recordV2Event } from "../v2/observability";
import { readMakeupProfessionalReportForArtifacts } from "../capabilities/makeup-professional-report-service";

type DirectionRow = { id: string; consultation_id: string; user_id: string; status: string; snapshot: MakeupDirectionSnapshot };
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

async function confirmedDirection(userId: string, consultationId: string) {
  const result = await getSupabaseAdminClient().from("makeup_direction_snapshots").select("id,consultation_id,user_id,status,snapshot")
    .eq("user_id", userId).eq("consultation_id", consultationId).eq("status", "confirmed").order("confirmed_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new HairfitV2Error("MAKEUP_DIRECTION_NOT_CONFIRMED", 409, "메이크업 방향을 먼저 확정해 주세요.");
  return result.data as unknown as DirectionRow;
}

export async function ensureMakeupRoutine(userId: string, consultationId: string, requestedMode?: "compact" | "full") {
  const db = getSupabaseAdminClient(); const row = await confirmedDirection(userId, consultationId);
  const mode = requestedMode ?? (row.snapshot.context.preparationMinutes <= 10 ? "compact" : "full");
  const replay = await db.from("makeup_routines").select("routine").eq("user_id", userId).eq("makeup_direction_snapshot_id", row.id).eq("mode", mode).maybeSingle();
  if (replay.error) throw new Error(replay.error.message); if (replay.data) return (replay.data as unknown as { routine: MakeupRoutine }).routine;
  const routine = compileMakeupRoutineV1({ id: randomUUID(), snapshot: row.snapshot, mode, createdAt: new Date().toISOString() });
  const inserted = await db.from("makeup_routines").insert({ id: routine.id, consultation_id: consultationId, user_id: userId, makeup_direction_snapshot_id: row.id, personal_color_profile_id: row.snapshot.source.personalColorProfileId, selected_style_snapshot_id: row.snapshot.source.selectedStyleId, mode: routine.mode, compiler_version: "makeup-routine-v1", routine, estimated_seconds: routine.estimatedSeconds }).select("routine").single();
  if (inserted.error?.code === "23505") return ensureMakeupRoutine(userId, consultationId, mode);
  if (inserted.error) throw new Error(inserted.error.message);
  await recordV2Event({ consultationId, userId, eventType: "makeup.routine.ready", payload: { snapshotId: row.id, moduleCount: routine.steps.length, durationMs: routine.estimatedSeconds * 1000, state: routine.mode } });
  return (inserted.data as unknown as { routine: MakeupRoutine }).routine;
}

export async function ensureMakeupArtistBrief(userId: string, consultationId: string) {
  const db = getSupabaseAdminClient(); const row = await confirmedDirection(userId, consultationId);
  const replay = await db.from("makeup_artist_briefs").select("brief").eq("user_id", userId).eq("makeup_direction_snapshot_id", row.id).maybeSingle();
  if (replay.error) throw new Error(replay.error.message); if (replay.data) return (replay.data as unknown as { brief: MakeupArtistBrief }).brief;
  const brief = compileMakeupArtistBriefV1({ id: randomUUID(), snapshot: row.snapshot, createdAt: new Date().toISOString() });
  const inserted = await db.from("makeup_artist_briefs").insert({ id: brief.id, consultation_id: consultationId, user_id: userId, makeup_direction_snapshot_id: row.id, personal_color_profile_id: row.snapshot.source.personalColorProfileId, selected_style_snapshot_id: row.snapshot.source.selectedStyleId, compiler_version: "makeup-artist-brief-v1", source_photo_included: false, brief }).select("brief").single();
  if (inserted.error?.code === "23505") return ensureMakeupArtistBrief(userId, consultationId);
  if (inserted.error) throw new Error(inserted.error.message);
  return (inserted.data as unknown as { brief: MakeupArtistBrief }).brief;
}

export async function ensureMakeupArtifacts(userId: string, consultationId: string) {
  const [routine, brief] = await Promise.all([ensureMakeupRoutine(userId, consultationId), ensureMakeupArtistBrief(userId, consultationId)]);
  return { routine, brief };
}

export async function readMakeupArtifacts(userId: string, consultationId: string) {
  const db = getSupabaseAdminClient();
  const [routine, brief, share] = await Promise.all([
    db.from("makeup_routines").select("routine").eq("user_id", userId).eq("consultation_id", consultationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("makeup_artist_briefs").select("brief").eq("user_id", userId).eq("consultation_id", consultationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("makeup_brief_shares").select("expires_at,revoked_at,include_source_photo").eq("user_id", userId).eq("consultation_id", consultationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const result of [routine, brief, share]) if (result.error) throw new Error(result.error.message);
  return { routine: (routine.data as unknown as { routine?: MakeupRoutine } | null)?.routine ?? null, brief: (brief.data as unknown as { brief?: MakeupArtistBrief } | null)?.brief ?? null, share: share.data ? { active: !(share.data as { revoked_at: string | null }).revoked_at && Date.parse(String((share.data as { expires_at: string }).expires_at)) > Date.now(), expiresAt: String((share.data as { expires_at: string }).expires_at), sourcePhotoIncluded: Boolean((share.data as { include_source_photo?: boolean }).include_source_photo) } : null };
}

export async function createMakeupBriefShare(userId: string, consultationId: string, input: { hours: 24 | 168 | 720; includeSourcePhoto?: boolean }) {
  const db = getSupabaseAdminClient(); const brief = await ensureMakeupArtistBrief(userId, consultationId);
  let sourceAsset: { bucket: string; path: string } | null = null;
  let sourceAssetExpiry: number | null = null;
  if (input.includeSourcePhoto === true) {
    const asset = await db.from("personal_color_capture_assets").select("storage_bucket,storage_path,expires_at").eq("user_id", userId).eq("consultation_id", consultationId).eq("role", "color_primary").eq("status", "quality_ready").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (asset.error) throw new Error(asset.error.message);
    if (!asset.data) throw new HairfitV2Error("MAKEUP_SHARE_SOURCE_PHOTO_UNAVAILABLE", 409, "공유할 원본 사진이 보존되어 있지 않습니다.");
    sourceAsset = { bucket: String((asset.data as { storage_bucket: string }).storage_bucket), path: String((asset.data as { storage_path: string }).storage_path) };
    sourceAssetExpiry = Date.parse(String((asset.data as { expires_at: string }).expires_at));
  }
  const token = randomBytes(32).toString("base64url"); const requestedExpiry = Date.now() + input.hours * 3_600_000;
  const expiresAt = new Date(sourceAssetExpiry ? Math.min(requestedExpiry, sourceAssetExpiry) : requestedExpiry).toISOString();
  const payload = { brief, sourcePhotoIncluded: Boolean(sourceAsset), sourceAsset };
  const inserted = await db.from("makeup_brief_shares").insert({ makeup_artist_brief_id: brief.id, consultation_id: consultationId, user_id: userId, token_hash: tokenHash(token), include_source_photo: Boolean(sourceAsset), payload, expires_at: expiresAt }).select("id").single();
  if (inserted.error) throw new Error(inserted.error.message);
  await recordV2Event({ consultationId, userId, eventType: "makeup.brief.shared", payload: { state: sourceAsset ? "with_explicit_source_photo" : "brief_only" } });
  return { token, expiresAt, sourcePhotoIncluded: Boolean(sourceAsset) };
}

export async function revokeMakeupBriefShare(userId: string, consultationId: string, token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) throw new HairfitV2Error("MAKEUP_SHARE_INVALID", 400, "공유 링크가 올바르지 않습니다.");
  const revokedAt = new Date().toISOString();
  const result = await getSupabaseAdminClient().from("makeup_brief_shares").update({ revoked_at: revokedAt }).eq("user_id", userId).eq("consultation_id", consultationId).eq("token_hash", tokenHash(token)).is("revoked_at", null).select("id").maybeSingle();
  if (result.error) throw new Error(result.error.message); if (!result.data) throw new HairfitV2Error("MAKEUP_SHARE_NOT_FOUND", 404, "활성 공유 링크를 찾지 못했습니다.");
  return { revokedAt };
}

export async function readPublicMakeupBriefShare(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const db = getSupabaseAdminClient(); const result = await db.from("makeup_brief_shares").select("payload,expires_at,revoked_at").eq("token_hash", tokenHash(token)).maybeSingle();
  if (result.error || !result.data) return null;
  const row = result.data as unknown as { payload: { brief: MakeupArtistBrief; sourcePhotoIncluded: boolean; sourceAsset: { bucket: string; path: string } | null }; expires_at: string; revoked_at: string | null };
  if (row.revoked_at || Date.parse(row.expires_at) <= Date.now()) return null;
  let sourcePhotoUrl: string | null = null;
  if (row.payload.sourcePhotoIncluded && row.payload.sourceAsset) {
    const signed = await db.storage.from(row.payload.sourceAsset.bucket).createSignedUrl(row.payload.sourceAsset.path, 600);
    if (!signed.error) sourcePhotoUrl = signed.data.signedUrl;
  }
  const [direction, routine] = await Promise.all([
    db.from("makeup_direction_snapshots").select("snapshot,user_id").eq("id", row.payload.brief.makeupDirectionSnapshotId).maybeSingle(),
    db.from("makeup_routines").select("routine").eq("makeup_direction_snapshot_id", row.payload.brief.makeupDirectionSnapshotId).eq("mode", row.payload.brief.context.preparationMinutes <= 10 ? "compact" : "full").maybeSingle(),
  ]);
  const snapshot = (direction.data as unknown as { snapshot?: MakeupDirectionSnapshot; user_id?: string } | null)?.snapshot ?? null;
  const ownerId = (direction.data as unknown as { user_id?: string } | null)?.user_id ?? null;
  const routineValue = (routine.data as unknown as { routine?: MakeupRoutine } | null)?.routine ?? null;
  const professionalReport = snapshot && ownerId && routineValue
    ? await readMakeupProfessionalReportForArtifacts({ userId: ownerId, snapshot, routine: routineValue, brief: row.payload.brief }).catch(() => null)
    : null;
  return { brief: row.payload.brief, routine: routineValue, professionalReport, expiresAt: row.expires_at, sourcePhotoIncluded: Boolean(sourcePhotoUrl), sourcePhotoUrl };
}
