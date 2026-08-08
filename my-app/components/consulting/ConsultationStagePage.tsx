"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { ConsultationSnapshot, ConsultationStage } from "../../lib/consulting/contracts";
import { useConsultationMutation } from "../../hooks/useConsultationMutation";
import { ConsultationScene } from "./scene/ConsultationScene";

type WorkbenchProps = { snapshot: ConsultationSnapshot; mutate: ReturnType<typeof useConsultationMutation>["mutate"]; saving: boolean };
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
  fashion: dynamic(() => import("./workbenches/FashionWorkbench").then((module) => module.FashionWorkbench)),
};

export function ConsultationStagePage({ initialSnapshot, stage }: { initialSnapshot: ConsultationSnapshot; stage: ConsultationStage }) {
  const { snapshot, isSaving, notice, mutate, refresh } = useConsultationMutation(initialSnapshot);
  const Workbench = workbenches[stage];
  return <ConsultationScene snapshot={snapshot} stage={stage} notice={notice} onRefresh={() => void refresh()} nextDisabled={!snapshot.completedStages.includes(stage)}><Workbench key={`${stage}-${snapshot.version}`} snapshot={snapshot} mutate={mutate} saving={isSaving} /></ConsultationScene>;
}
