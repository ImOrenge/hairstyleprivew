"use client";

import dynamic from "next/dynamic";
import { useCallback, type ComponentType } from "react";
import { resolveConsultationTransitionTask, type ConsultationSnapshot, type ConsultationStage, type ConsultationTaskKind } from "../../lib/consulting/contracts";
import { mapPreviewBoard, previewsMatch, type PreviewBoard } from "../../lib/consulting/preview-board-client";
import { useConsultationMutation } from "../../hooks/useConsultationMutation";
import { ConsultationScene } from "./scene/ConsultationScene";
import { ConsultationTaskRuntimeProvider, useConsultationTaskRuntime } from "./transition/ConsultationTaskRuntime";
import { ConsultationTransitionScreen } from "./transition/ConsultationTransitionScreen";

type WorkbenchProps = { snapshot: ConsultationSnapshot; mutate: ReturnType<typeof useConsultationMutation>["mutate"]; saving: boolean; interviewEnabled?: boolean };
const workbenches: Record<ConsultationStage, ComponentType<WorkbenchProps>> = {
  discovery: dynamic(() => import("./workbenches/DiscoveryWorkbench").then((module) => module.DiscoveryWorkbench)),
  photo: dynamic(() => import("./workbenches/PhotoWorkbench").then((module) => module.PhotoWorkbench)),
  scan: dynamic(() => import("./workbenches/ScanWorkbench").then((module) => module.ScanWorkbench)),
  analysis: dynamic(() => import("./workbenches/AnalysisWorkbench").then((module) => module.AnalysisWorkbench)),
  direction: dynamic(() => import("./workbenches/DirectionWorkbench").then((module) => module.DirectionWorkbench)),
  previews: dynamic(() => import("./workbenches/PreviewsWorkbench").then((module) => module.PreviewsWorkbench)),
  compare: dynamic(() => import("./workbenches/CompareWorkbench").then((module) => module.CompareWorkbench)),
  decision: dynamic(() => import("./workbenches/DecisionWorkbench").then((module) => module.DecisionWorkbench)),
  "salon-brief": dynamic(() => import("./workbenches/BriefWorkbench").then((module) => module.BriefWorkbench)),
  aftercare: dynamic(() => import("./workbenches/AftercareWorkbench").then((module) => module.AftercareWorkbench)),
  fashion: dynamic(() => import("./workbenches/FashionBatchWorkbench").then((module) => module.FashionBatchWorkbench)),
};

function ConsultationStageContent({ initialSnapshot, stage, initialTransitionKind, livenessEnabled, pollingEnabled, interviewEnabled }: { initialSnapshot: ConsultationSnapshot; stage: ConsultationStage; initialTransitionKind?: ConsultationTaskKind | null; livenessEnabled: boolean; pollingEnabled: boolean; interviewEnabled: boolean }) {
  const { snapshot, isSaving, notice, mutate, refresh } = useConsultationMutation(initialSnapshot);
  const runtime = useConsultationTaskRuntime();
  const Workbench = workbenches[stage];
  const persistedTask = resolveConsultationTransitionTask(snapshot, stage, initialTransitionKind);
  const task = persistedTask ?? runtime.task;
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
    ? <ConsultationTransitionScreen snapshot={snapshot} stage={stage} task={task} onPoll={pollTask} onClear={runtime.clearTask} />
    : <Workbench key={`${stage}-${snapshot.version}`} snapshot={snapshot} mutate={mutate} saving={isSaving} interviewEnabled={interviewEnabled} />;
  return <ConsultationScene snapshot={snapshot} stage={stage} notice={notice} onRefresh={() => void refresh()}>{content}</ConsultationScene>;
}

export function ConsultationStagePage({ initialSnapshot, stage, initialTransitionKind = null, livenessEnabled = true, pollingEnabled = true, interviewEnabled = false }: { initialSnapshot: ConsultationSnapshot; stage: ConsultationStage; initialTransitionKind?: ConsultationTaskKind | null; livenessEnabled?: boolean; pollingEnabled?: boolean; interviewEnabled?: boolean }) {
  return <ConsultationTaskRuntimeProvider><ConsultationStageContent initialSnapshot={initialSnapshot} stage={stage} initialTransitionKind={initialTransitionKind} livenessEnabled={livenessEnabled} pollingEnabled={pollingEnabled} interviewEnabled={interviewEnabled} /></ConsultationTaskRuntimeProvider>;
}
