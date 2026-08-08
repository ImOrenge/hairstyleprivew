import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdminClient } from "../supabase";
import { resolveGenerationImageUrl } from "../generation-image-storage";
import type { ConsultationSnapshot } from "./contracts";
import { selectedStyle } from "./contracts";

function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }

export async function createConsultationShare(userId: string, sessionId: string, hours: 24 | 168 | 720) {
  const supabase = getSupabaseAdminClient();
  const { data: session, error: readError } = await supabase.from("consultation_sessions").select("snapshot").eq("id", sessionId).eq("user_id", userId).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!session) throw new Error("NOT_FOUND");
  const snapshot = (session as unknown as { snapshot: ConsultationSnapshot }).snapshot;
  const style = selectedStyle(snapshot);
  if (!style || !snapshot.salonBrief.createdAt) throw new Error("BRIEF_NOT_READY");
  const sharePayload = {
    style: { label: style.label, reason: style.reason, imageUrl: style.imageUrl, generatedImagePath: style.generatedImagePath, feasibility: style.feasibility, services: style.services, maintenance: style.maintenance, limitations: style.limitations },
    brief: { version: snapshot.salonBrief.version, summary: snapshot.salonBrief.summary, cut: snapshot.salonBrief.cut, volumeTexture: snapshot.salonBrief.volumeTexture, styling: snapshot.salonBrief.styling, caution: snapshot.salonBrief.caution },
  };
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from("consultation_sessions").update({ share_token_hash: tokenHash(token), share_payload: sharePayload, share_expires_at: expiresAt, share_revoked_at: null })
    .eq("id", sessionId).eq("user_id", userId).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("NOT_FOUND");
  return { token, expiresAt };
}

export async function revokeConsultationShare(userId: string, sessionId: string) {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdminClient().from("consultation_sessions").update({ share_revoked_at: now })
    .eq("id", sessionId).eq("user_id", userId).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("NOT_FOUND");
  return { revokedAt: now };
}

export async function readPublicConsultationShare(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("consultation_sessions")
    .select("share_payload,share_expires_at,share_revoked_at").eq("share_token_hash", tokenHash(token)).maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as { share_payload: { style: { label: string; reason: string; imageUrl: string | null; generatedImagePath: string | null; feasibility: string; services: string[]; maintenance: string; limitations: string[] }; brief: { version: number; summary: string; cut: string; volumeTexture: string; styling: string; caution: string[] } } | null; share_expires_at: string | null; share_revoked_at: string | null };
  if (row.share_revoked_at || !row.share_expires_at || new Date(row.share_expires_at).getTime() <= Date.now()) return null;
  if (!row.share_payload) return null;
  const style = row.share_payload.style;
  const imageUrl = style.generatedImagePath ? await resolveGenerationImageUrl(supabase, { outputUrl: style.imageUrl, generatedImagePath: style.generatedImagePath }).catch(() => style.imageUrl) : style.imageUrl;
  return {
    expiresAt: row.share_expires_at,
    style: { label: style.label, reason: style.reason, imageUrl, feasibility: style.feasibility, services: style.services, maintenance: style.maintenance, limitations: style.limitations },
    brief: row.share_payload.brief,
  };
}
