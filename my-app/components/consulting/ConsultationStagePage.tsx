"use client";

import dynamic from "next/dynamic";
import type { CustomerStylebookConsultationReferenceContextV2 } from "@hairfit/shared";
import { useCallback, useState, type ComponentType } from "react";
import { deriveConsultationChapterSurface, resolveConsultationTransitionTask, type ConsultationReportViewModelV2, type ConsultationSnapshot, type ConsultationStage, type ConsultationTaskKind } from "../../lib/consulting/contracts";
import { mapPreviewBoard, previewsMatch, type PreviewBoard } from "../../lib/consulting/preview-board-client";
import { useConsultationMutation } from "../../hooks/useConsultationMutation";
import { ConsultationScene } from "./scene/ConsultationScene";
import { ConsultationTaskRuntimeProvider, useConsultationTaskRuntime } from "./transition/ConsultationTaskRuntime";
import { ConsultationTransitionScreen } from "./transition/ConsultationTransitionScreen";

type WorkbenchProps = { snapshot: ConsultationSnapshot; mutate: ReturnType<typeof useConsultationMutation>["mutate"]; refresh?: ReturnType<typeof useConsultationMutation>["refresh"]; saving: boolean; interviewEnabled?: boolean; progressiveInterviewEnabled?: boolean; zeroInputIntakeEnabled?: boolean; pollingEnabled?: boolean; initialReport?: ConsultationReportViewModelV2 | null };
const HairRecommendationWorkbench = dynamic(() => import("./hair/HairRecommendationWorkbench").then((module) => module.HairRecommendationWorkbench));
const workbenches: Record<ConsultationStage, ComponentType<WorkbenchProps>> = {
  discovery: dynamic(() => import("./workbenches/DiscoveryWorkbench").then((module) => module.DiscoveryWorkbench)),
  photo: dynamic(() => import("./workbenches/PhotoWorkbench").then((module) => module.PhotoWorkbench)),
  scan: dynamic(() => import("./workbenches/ScanWorkbench").then((module) => module.ScanWorkbench)),
  analysis: dynamic(() => import("./workbenches/AnalysisWorkbench").then((module) => module.AnalysisWorkbench)),
  "personal-color": dynamic(() => import("./workbenches/PersonalColorWorkbench").then((module) => module.PersonalColorWorkbench)),
  direction: dynamic(() => import("./workbenches/DirectionWorkbench").then((module) => module.DirectionWorkbench)),
  previews: dynamic(() => import("./workbenches/PreviewsWorkbench").then((module) => module.PreviewsWorkbench)),
  compare: dynamic(() => import("./workbenches/CompareWorkbench").then((module) => module.CompareWorkbench)),
  decision: dynamic(() => import("./workbenches/DecisionWorkbench").then((module) => module.DecisionWorkbench)),
  "color-studio": dynamic(() => import("./workbenches/ColorStudioWorkbench").then((module) => module.ColorStudioWorkbench)),
  "salon-brief": dynamic(() => import("./workbenches/BriefWorkbench").then((module) => module.BriefWorkbench)),
  makeup: dynamic(() => import("./workbenches/MakeupWorkbench").then((module) => module.MakeupWorkbench)),
  result: dynamic(() => import("./workbenches/ResultWorkbench").then((module) => module.ResultWorkbench)),
  aftercare: dynamic(() => import("./workbenches/AftercareWorkbench").then((module) => module.AftercareWorkbench)),
  fashion: dynamic(() => import("./workbenches/FashionBatchWorkbench").then((module) => module.FashionBatchWorkbench)),
};

function ConsultationStageContent({ initialSnapshot, initialReport, stylebookReference, stage, initialTransitionKind, livenessEnabled, pollingEnabled, interviewEnabled, progressiveInterviewEnabled, zeroInputIntakeEnabled, chapterNavigationEnabled, hairRecommendationEnabled }: { initialSnapshot: ConsultationSnapshot; initialReport?: ConsultationReportViewModelV2 | null; stylebookReference?: CustomerStylebookConsultationReferenceContextV2 | null; stage: ConsultationStage; initialTransitionKind?: ConsultationTaskKind | null; livenessEnabled: boolean; pollingEnabled: boolean; interviewEnabled: boolean; progressiveInterviewEnabled: boolean; zeroInputIntakeEnabled: boolean; chapterNavigationEnabled: boolean; hairRecommendationEnabled: boolean }) {
  const { snapshot, isSaving, notice, mutate, refresh } = useConsultationMutation(initialSnapshot);
  const runtime = useConsultationTaskRuntime();
  const [inspectedTaskId, setInspectedTaskId] = useState<string | null>(null);
  const Workbench = hairRecommendationEnabled && ["previews", "compare", "decision"].includes(stage)
    ? HairRecommendationWorkbench
    : workbenches[stage];
  const resolvedTask = resolveConsultationTransitionTask(snapshot, stage, initialTransitionKind);
  const persistedTask = resolvedTask?.kind === "makeup-simulation-generation" ? null : resolvedTask;
  const candidateTask = persistedTask ?? runtime.task;
  const task = candidateTask?.id === inspectedTaskId ? null : candidateTask;
  const surface = deriveConsultationChapterSurface(snapshot, stage);
  const pollTask = useCallback(async () => {
    if (!task || !pollingEnabled) return { ok: true as const };
    if (task.kind === "preview-generation") {
      const response = await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/preview-board`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { board?: PreviewBoard | null };
      if (response.ok && data.board) {
        const previews = mapPreviewBoard(data.board);
        if (!previewsMatch(snapshot.previews, previews)) {
          return await mutate({ previews }, { navigate: false });
        } else {
          return await refresh({ silent: true });
        }
      }
    }
    if (task.kind === "fashion-generation") {
      await fetch(`/api/v2/consultations/${encodeURIComponent(snapshot.sessionId)}/fashion-batch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconcile", batchId: snapshot.fashionBatch?.id ?? task.id }),
      });
    }
    return await refresh({ silent: true });
  }, [mutate, pollingEnabled, refresh, snapshot.fashionBatch?.id, snapshot.previews, snapshot.sessionId, task]);
  const content = livenessEnabled && task
    ? <ConsultationTransitionScreen snapshot={snapshot} stage={stage} task={task} onPoll={pollTask} onClear={runtime.clearTask} onInspectPartial={() => setInspectedTaskId(task.id)} />
    : <Workbench key={`${stage}-${snapshot.version}`} snapshot={snapshot} mutate={mutate} refresh={refresh} saving={isSaving} interviewEnabled={interviewEnabled} progressiveInterviewEnabled={progressiveInterviewEnabled} zeroInputIntakeEnabled={zeroInputIntakeEnabled} pollingEnabled={pollingEnabled} initialReport={initialReport} />;
  return <ConsultationScene snapshot={snapshot} stage={stage} surface={surface} notice={notice} onRefresh={() => void refresh()} chapterNavigationEnabled={chapterNavigationEnabled} stylebookReference={stylebookReference}>{content}</ConsultationScene>;
}

export function ConsultationStagePage({ initialSnapshot, initialReport = null, stylebookReference = null, stage, initialTransitionKind = null, livenessEnabled = true, pollingEnabled = true, interviewEnabled = false, progressiveInterviewEnabled = true, zeroInputIntakeEnabled = true, chapterNavigationEnabled = true, hairRecommendationEnabled = false }: { initialSnapshot: ConsultationSnapshot; initialReport?: ConsultationReportViewModelV2 | null; stylebookReference?: CustomerStylebookConsultationReferenceContextV2 | null; stage: ConsultationStage; initialTransitionKind?: ConsultationTaskKind | null; livenessEnabled?: boolean; pollingEnabled?: boolean; interviewEnabled?: boolean; progressiveInterviewEnabled?: boolean; zeroInputIntakeEnabled?: boolean; chapterNavigationEnabled?: boolean; hairRecommendationEnabled?: boolean }) {
  return <ConsultationTaskRuntimeProvider><ConsultationStageContent initialSnapshot={initialSnapshot} initialReport={initialReport} stylebookReference={stylebookReference} stage={stage} initialTransitionKind={initialTransitionKind} livenessEnabled={livenessEnabled} pollingEnabled={pollingEnabled} interviewEnabled={interviewEnabled} progressiveInterviewEnabled={progressiveInterviewEnabled} zeroInputIntakeEnabled={zeroInputIntakeEnabled} chapterNavigationEnabled={chapterNavigationEnabled} hairRecommendationEnabled={hairRecommendationEnabled} /></ConsultationTaskRuntimeProvider>;
}
