import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { ConsultationResultSummary, ConsultationSnapshot } from "./contracts";
import { selectedStyle } from "./contracts";
import { getSupabaseAdminClient } from "../supabase";
import { isMissingOptionalTableError } from "./supabase-errors";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function isResultCompilationReady(snapshot: ConsultationSnapshot) {
  const personalColorTerminal = ["ready", "deferred", "unavailable"].includes(snapshot.personalColorDiagnosis.state);
  const colorTerminal = ["confirmed", "keep-current", "deferred", "salon-review", "not-applicable"].includes(snapshot.colorDecision.state);
  const fashionMatchesColor = !snapshot.colorDecision.id || snapshot.fashion.sourceColorSelectionId === snapshot.colorDecision.id;
  const fashionTerminal = Boolean(snapshot.fashion.lookId && snapshot.fashion.selectedAt && !snapshot.fashion.staleReason && fashionMatchesColor);
  return snapshot.evidence.items.length > 0 && personalColorTerminal && Boolean(selectedStyle(snapshot)) && colorTerminal && Boolean(snapshot.salonBrief.createdAt) && fashionTerminal;
}

export async function compileConsultationResultV2(snapshot: ConsultationSnapshot): Promise<ConsultationResultSummary> {
  if (!isResultCompilationReady(snapshot)) return snapshot.result;
  const style = selectedStyle(snapshot)!; const db = getSupabaseAdminClient(); const compiledAt = new Date().toISOString();
  const input = { selectionSnapshotId: style.id, colorDecisionId: snapshot.colorDecision.id, personalColorEvidenceId: snapshot.personalColorDiagnosis.evidenceId, salonBriefVersion: snapshot.salonBrief.version, fashionLookId: snapshot.fashion.lookId, fashionSelectedAt: snapshot.fashion.selectedAt, fashionSourceColorSelectionId: snapshot.fashion.sourceColorSelectionId ?? null, consultationVersion: snapshot.version };
  const fingerprint = createHash("sha256").update(stable(input)).digest("hex");
  const next: ConsultationResultSummary = {
    id: randomUUID(), version: Math.max(1, snapshot.result.version + 1), state: snapshot.result.compiledAt ? "updated" : "core-ready",
    heroImageUrl: snapshot.colorDecision.finalImageUrl || style.imageUrl, heroImagePath: snapshot.colorDecision.finalImagePath || style.generatedImagePath,
    headline: `${style.label}을 중심으로 완성한 AI 헤어 컨설팅`,
    rationale: [style.reason, snapshot.personalColorDiagnosis.primaryType ? `${snapshot.personalColorDiagnosis.primaryType} 컬러 근거 반영` : "퍼스널 컬러 선택 보류", snapshot.colorDecision.state === "confirmed" ? `${snapshot.colorDecision.colorName} 컬러 확정` : snapshot.colorDecision.state === "keep-current" ? "현재 모발 색상 유지" : "염색은 살롱에서 최종 검토", `${snapshot.fashion.label || "확정 패션 룩"}과 헤어 인상 연결`],
    limitations: [...style.limitations, ...snapshot.colorDecision.warnings],
    nextActions: ["살롱 브리프를 디자이너와 확인", `${snapshot.fashion.label || "확정 패션 룩"}의 팔레트와 실루엣 활용`, "실제 시술 후 Aftercare 기록"],
    selectionSnapshotId: style.id, colorSelectionSnapshotId: snapshot.colorDecision.id, personalColorEvidenceId: snapshot.personalColorDiagnosis.evidenceId, salonBriefVersion: snapshot.salonBrief.version,
    fashionLookId: snapshot.fashion.lookId, fashionSelectedAt: snapshot.fashion.selectedAt, fashionSourceColorSelectionId: snapshot.fashion.sourceColorSelectionId ?? null, compiledAt,
  };
  const selection = await db.from("style_selection_snapshots_v2").select("id").eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId).eq("status", "confirmed").maybeSingle();
  if (selection.error) throw new Error(selection.error.message);
  if (!selection.data) return next;
  const replay = await db.from("consultation_result_snapshots_v2").select("id,snapshot").eq("user_id", snapshot.userId).eq("input_fingerprint", fingerprint).maybeSingle();
  if (replay.error) {
    if (isMissingOptionalTableError(replay.error)) return next;
    throw new Error(replay.error.message);
  }
  if (replay.data) {
    const row = replay.data as unknown as { id: string; snapshot: ConsultationResultSummary };
    return { ...row.snapshot, id: row.id };
  }
  const color = await db.from("color_selection_snapshots_v2").select("id").eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId).order("confirmed_at", { ascending: false }).limit(1).maybeSingle();
  if (color.error && !isMissingOptionalTableError(color.error)) throw new Error(color.error.message);
  const brief = await db.from("salon_brief_versions_v2").select("id").eq("consultation_id", snapshot.sessionId).eq("user_id", snapshot.userId).eq("version", snapshot.salonBrief.version).maybeSingle();
  if (brief.error && !isMissingOptionalTableError(brief.error)) throw new Error(brief.error.message);
  const inserted = await db.from("consultation_result_snapshots_v2").insert({ id: next.id, consultation_id: snapshot.sessionId, user_id: snapshot.userId, selection_snapshot_id: String((selection.data as { id: unknown }).id), color_selection_snapshot_id: color.error ? null : (color.data as { id?: string } | null)?.id ?? null, personal_color_evidence_id: snapshot.personalColorDiagnosis.evidenceId, salon_brief_version_id: brief.error ? null : (brief.data as { id?: string } | null)?.id ?? null, snapshot_version: next.version, input_fingerprint: fingerprint, state: next.state === "updated" ? "updated" : "core_ready", snapshot: next, compiled_at: compiledAt }).select("id").single();
  if (inserted.error) {
    if (isMissingOptionalTableError(inserted.error)) return next;
    throw new Error(inserted.error.message);
  }
  return next;
}
