"use client";

import { useState } from "react";
import type { ConsultationInputProfile, ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { ChoiceGroup, Panel, SaveStageButton, SurfaceCard, TextField, WorkbenchGrid } from "./shared";

export function DiscoveryWorkbench({ snapshot, mutate, saving }: { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>; saving: boolean }) {
  const [value, setValue] = useState<ConsultationInputProfile>(snapshot.discovery);
  const toggle = (key: "goals" | "desiredServices" | "avoid", item: string) => setValue((current) => ({ ...current, [key]: current[key].includes(item) ? current[key].filter((entry) => entry !== item) : [...current[key], item] }));
  return <WorkbenchGrid>
    <Panel className="grid gap-7 p-5 sm:p-7">
      <ChoiceGroup label="원하는 변화" values={["더 또렷한 인상", "부드러운 인상", "얼굴 균형 보완", "손질 시간 단축", "새로운 이미지"]} selected={value.goals} onToggle={(item) => toggle("goals", item)} />
      <TextField label="현재 모발 상태" value={value.currentHair} onChange={(currentHair) => setValue({ ...value, currentHair })} placeholder="예: 어깨 아래 길이, 잦은 염색으로 끝부분 손상" />
      <ChoiceGroup label="고려 중인 서비스" values={["커트", "펌", "염색", "클리닉", "아직 모름"]} selected={value.desiredServices} onToggle={(item) => toggle("desiredServices", item)} />
      <ChoiceGroup label="가능한 관리 강도" values={["낮음", "보통", "높음"]} selected={[value.maintenanceLevel === "low" ? "낮음" : value.maintenanceLevel === "high" ? "높음" : "보통"]} multiple={false} onToggle={(item) => setValue({ ...value, maintenanceLevel: item === "낮음" ? "low" : item === "높음" ? "high" : "medium" })} />
      <ChoiceGroup label="피하고 싶은 것" values={["짧은 앞머리", "과한 볼륨", "강한 컬", "잦은 뿌리 염색", "매일 고데기"]} selected={value.avoid} onToggle={(item) => toggle("avoid", item)} />
      <TextField label="추가로 알려줄 내용" value={value.notes} onChange={(notes) => setValue({ ...value, notes })} />
      <SaveStageButton loading={saving} disabled={!value.goals.length || !value.currentHair.trim()} onClick={() => void mutate({ discovery: value, completeStage: "discovery", currentStage: "photo" })} />
    </Panel>
    <SurfaceCard className="p-5 sm:p-6"><p className="app-kicker">ConsultationInputProfile</p><h2 className="mt-3 text-xl font-black">좋아 보이는 이미지보다 가능한 결정을 먼저</h2><p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">선택한 목표·시술·관리 강도·회피 조건은 05 전략과 09 살롱 브리프까지 같은 기준으로 이어집니다.</p></SurfaceCard>
  </WorkbenchGrid>;
}
