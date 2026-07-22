"use client";

import { useState } from "react";
import {
  FaceScanOverlay,
  PersonalColorDiagnosisProgress,
  PersonalColorSwatchAnalysisColumn,
} from "../personal-color/PersonalColorDiagnosisProgress";
import { Button } from "../ui/Button";
import { Panel, SurfaceCard } from "../ui/Surface";

export function PersonalColorDiagnosisProgressHarness() {
  const [scanActive, setScanActive] = useState(true);

  return (
    <div
      className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10"
      data-e2e-personal-color-progress="true"
    >
      <Panel as="section" aria-labelledby="personal-color-progress-harness-title" className="space-y-4 p-6">
        <p className="app-kicker">E2E 전용</p>
        <h1 id="personal-color-progress-harness-title" className="text-3xl font-black text-[var(--app-text)]">
          개인컬러 진단 진행 상태 검증
        </h1>
        <p className="text-sm leading-6 text-[var(--app-muted)]">
          진단 메시지 공지, 장식용 팔레트, 동작 줄이기 설정과 스캔 오버레이가 같은 접근성 계약을 유지하는지 확인합니다.
        </p>
        <Button
          aria-pressed={scanActive}
          onClick={() => setScanActive((current) => !current)}
          type="button"
          variant="secondary"
        >
          스캔 오버레이 {scanActive ? "숨기기" : "보기"}
        </Button>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <SurfaceCard className="overflow-hidden p-4">
          <div
            aria-label="개인컬러 진단 사진 미리보기"
            className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-[linear-gradient(145deg,var(--app-accent-soft),var(--app-surface-muted))]"
            role="img"
          >
            <div aria-hidden="true" className="h-40 w-28 rounded-[48%_48%_42%_42%] bg-[var(--app-surface)] shadow-[0_18px_50px_rgba(15,23,42,0.16)]" />
            <FaceScanOverlay active={scanActive} />
          </div>
        </SurfaceCard>

        <div className="grid content-start gap-4">
          <PersonalColorDiagnosisProgress />
          <PersonalColorSwatchAnalysisColumn />
        </div>
      </div>
    </div>
  );
}
