"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ConsultationSnapshot, ConsultationStage } from "../../../lib/consulting/contracts";
import { SceneIdentity } from "./SceneIdentity";
import { FloatingStageControls } from "./FloatingStageControls";
import { StageMapOverlay } from "./StageMapOverlay";

export function ConsultationScene({ snapshot, stage, children, notice, onRefresh, nextDisabled }: { snapshot: ConsultationSnapshot; stage: ConsultationStage; children: ReactNode; notice?: string | null; onRefresh?: () => void; nextDisabled?: boolean }) {
  const [mapOpen, setMapOpen] = useState(false);
  const openMap = useCallback(() => setMapOpen(true), []);
  const closeMap = useCallback(() => setMapOpen(false), []);
  useEffect(() => {
    document.getElementById("consultation-scene-title")?.focus();
  }, [stage]);
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[96rem] px-4 pb-28 pt-8 sm:px-8 sm:pt-12 lg:px-12">
      <SceneIdentity stage={stage} />
      {notice ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-[var(--app-warning)] bg-[var(--app-warning-bg)] px-4 py-3 text-sm"><p>{notice}</p>{onRefresh ? <button type="button" className="font-black underline" onClick={onRefresh}>서버 상태 다시 불러오기</button> : null}</div> : null}
      <div className="mt-10">{children}</div>
      <FloatingStageControls snapshot={snapshot} stage={stage} onOpenMap={openMap} nextDisabled={nextDisabled} />
      <StageMapOverlay open={mapOpen} onClose={closeMap} snapshot={snapshot} stage={stage} />
    </div>
  );
}
