import "server-only";

import {
  isConsultationStage,
  type ConsultationLifecycleState,
  type ConsultationStage,
} from "./consulting/contracts";
import {
  CONSULTATION_STAGE_DEFINITIONS,
  consultationStageHref,
} from "./consulting/routes";
import {
  loadCustomerAftercareV2,
  type CustomerAftercareRecordV2,
} from "./v2/customer-history-server";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";
import { resolveGenerationImageUrl } from "./generation-image-storage";

const ACTIVE_LIFECYCLE_STATES: ConsultationLifecycleState[] = [
  "draft",
  "photo_validated",
  "analysis_ready",
  "preview_board_queued",
  "preview_board_ready",
  "shortlisted",
  "style_selected",
  "selection_confirmed",
  "salon_brief_ready",
  "aftercare_ready",
  "fashion_ready",
];

interface CustomerHomeConsultationRow {
  id?: unknown;
  lifecycle_state?: unknown;
  current_stage?: unknown;
  snapshot?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

export interface CustomerHomeConsultationV2 {
  consultationId: string;
  href: string;
  stage: ConsultationStage;
  stageTitle: string;
  startedAt: string;
  updatedAt: string;
}

export interface CustomerHomeResultV2 {
  consultationId: string;
  href: string;
  title: string;
  completedAt: string;
  imageUrl: string | null;
}

export interface CustomerHomeV2 {
  inProgress: CustomerHomeConsultationV2 | null;
  completed: CustomerHomeResultV2 | null;
  care: CustomerAftercareRecordV2 | null;
}

interface CustomerHomeConsultationProjectionV2 {
  inProgress: CustomerHomeConsultationV2 | null;
  completed: (Omit<CustomerHomeResultV2, "imageUrl"> & {
    imagePath: string | null;
    fallbackImageUrl: string | null;
  }) | null;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function consultationStage(value: unknown, fallback: ConsultationStage): ConsultationStage {
  const normalized = cleanString(value);
  return isConsultationStage(normalized) ? normalized : fallback;
}

function stageTitle(stage: ConsultationStage) {
  return CONSULTATION_STAGE_DEFINITIONS.find((definition) => definition.slug === stage)?.title
    ?? "상담 계속하기";
}

function selectedStyleRecord(snapshot: Record<string, unknown> | null) {
  const history = Array.isArray(snapshot?.selectedStyleHistory)
    ? snapshot.selectedStyleHistory
    : [];
  return objectOrNull(history.at(-1));
}

export function projectCustomerHomeConsultationsV2(
  activeRow: CustomerHomeConsultationRow | null,
  completedRow: CustomerHomeConsultationRow | null,
): CustomerHomeConsultationProjectionV2 {
  const activeId = cleanString(activeRow?.id);
  const activeLifecycle = cleanString(activeRow?.lifecycle_state);
  const activeSnapshot = objectOrNull(activeRow?.snapshot);
  const activeJourney = objectOrNull(activeSnapshot?.journey);
  const activeCurrentStage = consultationStage(
    activeRow?.current_stage,
    consultationStage(activeSnapshot?.currentStage, "discovery"),
  );
  const recommendedStage = consultationStage(activeJourney?.recommendedStage, activeCurrentStage);
  const inProgress = activeId && ACTIVE_LIFECYCLE_STATES.includes(activeLifecycle as ConsultationLifecycleState)
    ? {
        consultationId: activeId,
        href: consultationStageHref(activeId, recommendedStage),
        stage: recommendedStage,
        stageTitle: stageTitle(recommendedStage),
        startedAt: cleanString(activeRow?.created_at) || cleanString(activeSnapshot?.createdAt),
        updatedAt: cleanString(activeRow?.updated_at) || cleanString(activeSnapshot?.updatedAt),
      }
    : null;

  const completedId = cleanString(completedRow?.id);
  const completedLifecycle = cleanString(completedRow?.lifecycle_state);
  const completedSnapshot = objectOrNull(completedRow?.snapshot);
  const result = objectOrNull(completedSnapshot?.result);
  const colorDecision = objectOrNull(completedSnapshot?.colorDecision);
  const selectedStyle = selectedStyleRecord(completedSnapshot);
  const completed = completedId && completedLifecycle === "completed"
    ? {
        consultationId: completedId,
        href: consultationStageHref(completedId, "result"),
        title: cleanString(result?.headline) || cleanString(selectedStyle?.label) || "최근 완성된 컨설팅",
        completedAt:
          cleanString(result?.compiledAt)
          || cleanString(completedRow?.updated_at)
          || cleanString(completedSnapshot?.updatedAt),
        imagePath:
          cleanString(result?.heroImagePath)
          || cleanString(colorDecision?.finalImagePath)
          || cleanString(selectedStyle?.generatedImagePath)
          || null,
        fallbackImageUrl:
          cleanString(result?.heroImageUrl)
          || cleanString(colorDecision?.finalImageUrl)
          || cleanString(selectedStyle?.imageUrl)
          || null,
      }
    : null;

  return { inProgress, completed };
}

export function emptyCustomerHomeV2(): CustomerHomeV2 {
  return { inProgress: null, completed: null, care: null };
}

export async function loadCustomerHomeV2(userId: string): Promise<CustomerHomeV2> {
  if (!isSupabaseConfigured()) return emptyCustomerHomeV2();
  const db = getSupabaseAdminClient();
  const [activeResult, completedResult, careRecords] = await Promise.all([
    db.from("consultation_sessions")
      .select("id,lifecycle_state,current_stage,snapshot,created_at,updated_at")
      .eq("user_id", userId)
      .in("lifecycle_state", ACTIVE_LIFECYCLE_STATES)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("consultation_sessions")
      .select("id,lifecycle_state,current_stage,snapshot,created_at,updated_at")
      .eq("user_id", userId)
      .eq("lifecycle_state", "completed")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadCustomerAftercareV2(userId, { limit: 1 }),
  ]);
  if (activeResult.error) throw new Error(activeResult.error.message);
  if (completedResult.error) throw new Error(completedResult.error.message);

  const projection = projectCustomerHomeConsultationsV2(
    activeResult.data as unknown as CustomerHomeConsultationRow | null,
    completedResult.data as unknown as CustomerHomeConsultationRow | null,
  );
  const imageUrl = projection.completed?.imagePath
    ? await resolveGenerationImageUrl(db, {
        outputUrl: null,
        generatedImagePath: projection.completed.imagePath,
      }).catch(() => projection.completed?.fallbackImageUrl ?? null)
    : projection.completed?.fallbackImageUrl ?? null;

  return {
    inProgress: projection.inProgress,
    completed: projection.completed
      ? {
          consultationId: projection.completed.consultationId,
          href: projection.completed.href,
          title: projection.completed.title,
          completedAt: projection.completed.completedAt,
          imageUrl,
        }
      : null,
    care: careRecords[0] ?? null,
  };
}
