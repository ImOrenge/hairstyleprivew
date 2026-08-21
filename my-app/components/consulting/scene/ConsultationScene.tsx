"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ConsultationChapterSurfaceV1, ConsultationSnapshot, ConsultationStage } from "../../../lib/consulting/contracts";
import { SceneIdentity } from "./SceneIdentity";
import { FloatingStageControls } from "./FloatingStageControls";
import { StageMapOverlay } from "./StageMapOverlay";

export function ConsultationScene({ snapshot, stage, surface, children, notice, onRefresh, chapterNavigationEnabled = true }: { snapshot: ConsultationSnapshot; stage: ConsultationStage; surface?: ConsultationChapterSurfaceV1; children: ReactNode; notice?: string | null; onRefresh?: () => void; chapterNavigationEnabled?: boolean }) {
  const [mapOpen, setMapOpen] = useState(false);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const openMap = useCallback(() => setMapOpen(true), []);
  const closeMap = useCallback(() => setMapOpen(false), []);
  useEffect(() => {
    if (document.querySelector(".f-consultant-transition, .f-consulting-interview")) return;
    document.getElementById("consultation-scene-title")?.focus();
  }, [stage]);
  const reportMode = stage === "result";
  return (
    <div data-consulting-hydrated={hydrated ? "true" : "false"} data-consulting-layout={reportMode ? "report" : "workbench"} data-consulting-surface={surface?.mode ?? "input"} className={`mx-auto min-h-dvh w-full max-w-[96rem] px-4 pb-28 pt-8 sm:px-8 sm:pt-12 lg:px-12 lg:pt-6 ${reportMode ? "lg:pb-24" : "lg:flex lg:h-dvh lg:min-h-0 lg:flex-col lg:overflow-hidden lg:pb-6"}`}>
      <SceneIdentity stage={stage} snapshot={snapshot} chapterNavigationEnabled={chapterNavigationEnabled} />
      {notice ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-[var(--app-warning)] bg-[var(--app-warning-bg)] px-4 py-3 text-sm"><p>{notice}</p>{onRefresh ? <button type="button" className="font-black underline" onClick={onRefresh}>서버 상태 다시 불러오기</button> : null}</div> : null}
      <div className={`mt-10 lg:mt-6 lg:flex-1 ${reportMode ? "" : "lg:min-h-0"}`}>{children}</div>
      <FloatingStageControls snapshot={snapshot} stage={stage} onOpenMap={openMap} chapterNavigationEnabled={chapterNavigationEnabled} />
      <StageMapOverlay open={mapOpen} onClose={closeMap} snapshot={snapshot} stage={stage} chapterNavigationEnabled={chapterNavigationEnabled} />
    </div>
  );
}
