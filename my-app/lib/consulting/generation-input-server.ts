import "server-only";

import { createHash } from "node:crypto";
import { validateConsultationGenerationInputV2 } from "@hairfit/shared/v2";
import type {
  ConsultationGenerationInputSnapshotV2,
  ConsultationInputProvenanceV2,
  ConsultationStyleTargetV2,
  StyleSelectionSnapshotV2,
} from "@hairfit/shared/v2";
import { getSupabaseAdminClient } from "../supabase";
import { selectedStyle, type ConsultationSnapshot } from "./contracts";
import { resolveConfirmedHairDecisionV2 } from "./generation-input-resolution";

type GenerationInputSources = {
  userId: string;
  consultationId: string;
  consultationVersion: number;
  consultationUpdatedAt: string;
  snapshot: ConsultationSnapshot;
  memberProfile: Record<string, unknown> | null;
  analysisEvidence: Record<string, unknown> | null;
  personalColorEvidence: Record<string, unknown> | null;
  selection: { id: string; snapshot: StyleSelectionSnapshotV2; confirmed_at: string | null } | null;
  bodyProfile: Record<string, unknown> | null;
  actualServiceRow: Record<string, unknown> | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    : [];
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function latestTimestamp(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? new Date(0).toISOString();
}

function swatchNames(value: unknown) {
  return Array.isArray(value) ? value.flatMap((item) => {
    const swatch = record(item);
    const label = text(swatch.nameKo ?? swatch.nameEn ?? swatch.hex, "");
    return label ? [label] : [];
  }) : [];
}

function provenance(source: ConsultationInputProvenanceV2["source"], sourceId: string, capturedAt: string, fieldPaths: string[]): ConsultationInputProvenanceV2 {
  return { source, sourceId, capturedAt, fieldPaths };
}

export function compileConsultationGenerationInputSnapshotV2(sources: GenerationInputSources): ConsultationGenerationInputSnapshotV2 {
  const snapshot = sources.snapshot;
  const memberProfile = sources.memberProfile ?? {};
  const analysis = sources.analysisEvidence ?? {};
  const faceShape = record(analysis.face_shape);
  const colorResult = record(sources.personalColorEvidence?.result);
  const activeStyle = selectedStyle(snapshot);
  const selectionSnapshot = sources.selection?.snapshot;
  const body = sources.bodyProfile;
  const styleTarget: ConsultationStyleTargetV2 = memberProfile.style_target === "male" || memberProfile.style_target === "female"
    ? memberProfile.style_target
    : "neutral";
  const profileUpdatedAt = text(memberProfile.updated_at, sources.consultationUpdatedAt);
  const analysisCapturedAt = text(analysis.created_at, sources.consultationUpdatedAt);
  const colorCapturedAt = text(sources.personalColorEvidence?.created_at, sources.consultationUpdatedAt);
  const selectionCapturedAt = sources.selection?.confirmed_at ?? selectionSnapshot?.confirmedAt ?? activeStyle?.selectedAt ?? null;
  const bodyUpdatedAt = text(body?.updated_at, sources.consultationUpdatedAt);
  const actualRow = sources.actualServiceRow;
  const actualService = actualRow ? {
    services: strings(actualRow.services),
    serviceDate: typeof actualRow.service_date === "string" ? actualRow.service_date : null,
    designerNotes: text(actualRow.designer_notes, ""),
    confirmedAt: text(actualRow.created_at, sources.consultationUpdatedAt),
  } : snapshot.actualService.confirmedAt ? {
    services: snapshot.actualService.services,
    serviceDate: snapshot.actualService.serviceDate,
    designerNotes: snapshot.actualService.designerNotes,
    confirmedAt: snapshot.actualService.confirmedAt,
  } : null;

  const payload = {
    schemaVersion: "consultation-generation-input-v1" as const,
    consultationId: sources.consultationId,
    consultationVersion: sources.consultationVersion,
    styleTarget,
    currentHair: {
      description: text(snapshot.discovery.currentHair),
      length: text(snapshot.discovery.hairLength),
      density: text(snapshot.discovery.hairDensity),
      strandThickness: text(snapshot.discovery.strandThickness),
      texture: text(snapshot.discovery.hairTexture),
      treatmentHistory: snapshot.discovery.treatmentHistory,
      damageLevel: text(snapshot.discovery.damageLevel),
    },
    goals: {
      purpose: text(snapshot.discovery.purpose),
      imageKeywords: snapshot.discovery.goals,
      changeLevel: text(snapshot.discovery.changeLevel),
      desiredServices: snapshot.discovery.allowedServices.length ? snapshot.discovery.allowedServices : snapshot.discovery.desiredServices,
      notes: snapshot.discovery.notes,
    },
    maintenance: {
      morningMinutes: snapshot.discovery.morningMinutes,
      heatStyling: text(snapshot.discovery.heatStyling),
      salonCycleWeeks: snapshot.discovery.salonCycleWeeks,
      maintenanceLevel: text(snapshot.discovery.maintenanceLevel),
    },
    avoidConditions: snapshot.discovery.avoid,
    analysis: {
      evidenceId: typeof analysis.id === "string" ? analysis.id : null,
      faceShape: text(faceShape.primary ?? snapshot.faceAnalysis.faceShape, "확인 전"),
      faceShapeBlend: Object.fromEntries(Object.entries(record(faceShape.blend)).filter((entry): entry is [string, number] => typeof entry[1] === "number")),
      summary: text(faceShape.summary ?? snapshot.faceAnalysis.balance, "분석 근거 확인 전"),
    },
    personalColor: sources.personalColorEvidence || snapshot.personalColor.season !== "확인 전" ? {
      evidenceId: typeof sources.personalColorEvidence?.id === "string" ? sources.personalColorEvidence.id : null,
      season: text(colorResult.season ?? snapshot.personalColor.season, "확인 전"),
      undertone: text(colorResult.undertone ?? snapshot.personalColor.undertone, "확인 전"),
      confidence: numberOrNull(colorResult.confidence),
      bestColors: swatchNames(colorResult.bestColors),
      avoidColors: swatchNames(colorResult.avoidColors),
    } : null,
    hairDecision: resolveConfirmedHairDecisionV2({
      selectionSnapshot,
      selectionId: sources.selection?.id,
      selectionConfirmedAt: selectionCapturedAt,
      activeStyle,
    }),
    fashion: {
      direction: {
        situation: snapshot.fashion.directionSnapshot.situation,
        genre: snapshot.fashion.directionSnapshot.genre,
        season: snapshot.fashion.directionSnapshot.season,
        fit: snapshot.fashion.directionSnapshot.fit,
        exposure: snapshot.fashion.directionSnapshot.exposure,
        budget: snapshot.fashion.directionSnapshot.budget,
        avoidItems: snapshot.fashion.directionSnapshot.avoidItems,
      },
      bodyProfile: body ? {
        heightCm: numberOrNull(body.height_cm),
        bodyShape: typeof body.body_shape === "string" ? body.body_shape : null,
        topSize: typeof body.top_size === "string" ? body.top_size : null,
        bottomSize: typeof body.bottom_size === "string" ? body.bottom_size : null,
        fitPreference: typeof body.fit_preference === "string" ? body.fit_preference : null,
        exposurePreference: typeof body.exposure_preference === "string" ? body.exposure_preference : null,
        avoidItems: strings(body.avoid_items),
      } : null,
    },
    actualService,
    provenance: [
      provenance("member-profile", sources.userId, profileUpdatedAt, ["styleTarget"]),
      provenance("discovery-interview", sources.consultationId, sources.consultationUpdatedAt, ["currentHair", "goals", "maintenance", "avoidConditions"]),
      ...(sources.analysisEvidence ? [provenance("photo-analysis", text(analysis.id, sources.consultationId), analysisCapturedAt, ["analysis"])] : []),
      ...(sources.personalColorEvidence ? [provenance("personal-color-analysis", text(sources.personalColorEvidence.id, sources.consultationId), colorCapturedAt, ["personalColor"])] : []),
      ...(snapshot.strategy.confirmedAt ? [provenance("strategy-confirmation", sources.consultationId, snapshot.strategy.confirmedAt, ["goals", "maintenance"])] : []),
      ...(selectionCapturedAt ? [provenance("style-selection", sources.selection?.id ?? activeStyle?.id ?? sources.consultationId, selectionCapturedAt, ["hairDecision"])] : []),
      provenance("fashion-interview", sources.consultationId, sources.consultationUpdatedAt, ["fashion.direction"]),
      ...(body ? [provenance("body-profile", sources.consultationId, bodyUpdatedAt, ["fashion.bodyProfile"])] : []),
      ...(actualService ? [provenance("actual-service", text(actualRow?.id, sources.consultationId), actualService.confirmedAt, ["actualService"])] : []),
    ],
  };
  const capturedAt = latestTimestamp(payload.provenance.map((item) => item.capturedAt));
  const inputFingerprint = createHash("sha256").update(stable(payload)).digest("hex");
  const compiled = { ...payload, capturedAt, inputFingerprint };
  const validationErrors = validateConsultationGenerationInputV2(compiled);
  if (validationErrors.length) {
    throw new Error(`CONSULTATION_GENERATION_INPUT_INVALID:${validationErrors.join(",")}`);
  }
  return compiled;
}

export async function loadConsultationGenerationInputSnapshotV2(userId: string, consultationId: string) {
  const db = getSupabaseAdminClient();
  const [consultation, memberProfile, analysisEvidence, personalColorEvidence, selection, bodyProfile, actualService] = await Promise.all([
    db.from("consultation_sessions").select("id,version,snapshot,updated_at").eq("id", consultationId).eq("user_id", userId).maybeSingle(),
    db.from("member_profiles").select("style_target,updated_at").eq("user_id", userId).maybeSingle(),
    db.from("analysis_evidence_v2").select("id,face_shape,created_at").eq("consultation_id", consultationId).eq("user_id", userId).maybeSingle(),
    db.from("personal_color_evidence_v2").select("id,result,created_at").eq("consultation_id", consultationId).eq("user_id", userId).maybeSingle(),
    db.from("style_selection_snapshots_v2").select("id,snapshot,confirmed_at").eq("consultation_id", consultationId).eq("user_id", userId).eq("status", "confirmed").maybeSingle(),
    db.from("user_style_profiles").select("height_cm,body_shape,top_size,bottom_size,fit_preference,exposure_preference,avoid_items,updated_at").eq("user_id", userId).maybeSingle(),
    db.from("actual_services_v2").select("id,services,service_date,designer_notes,created_at").eq("consultation_id", consultationId).eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (consultation.error) throw new Error(consultation.error.message);
  if (!consultation.data) throw new Error("CONSULTATION_NOT_FOUND");
  for (const result of [memberProfile, analysisEvidence, personalColorEvidence, selection, bodyProfile, actualService]) {
    if (result.error) throw new Error(result.error.message);
  }
  const row = consultation.data as unknown as { id: string; version: number; snapshot: ConsultationSnapshot; updated_at: string };
  return compileConsultationGenerationInputSnapshotV2({
    userId,
    consultationId: row.id,
    consultationVersion: row.version,
    consultationUpdatedAt: row.updated_at,
    snapshot: row.snapshot,
    memberProfile: memberProfile.data as Record<string, unknown> | null,
    analysisEvidence: analysisEvidence.data as Record<string, unknown> | null,
    personalColorEvidence: personalColorEvidence.data as Record<string, unknown> | null,
    selection: selection.data as unknown as GenerationInputSources["selection"],
    bodyProfile: bodyProfile.data as Record<string, unknown> | null,
    actualServiceRow: actualService.data as Record<string, unknown> | null,
  });
}
