"use client";

import { useState } from "react";
import type { ConsultationInputProfile, ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import { DiscoveryInterview } from "../interview/DiscoveryInterview";
import { ChoiceGroup, ConsultationSystemData, DefinitionRows, Panel, SaveStageButton, SurfaceCard, TextField, WorkbenchGrid } from "./shared";

const PURPOSES = ["출근·업무 이미지", "일상 이미지 정리", "중요 일정", "큰 스타일 변화"];
const GOALS = ["더 또렷한 인상", "부드러운 인상", "얼굴 균형 보완", "손질 시간 단축", "새로운 이미지"];
const SERVICES = ["커트", "펌", "염색", "클리닉"];
const AVOID = ["짧은 앞머리", "과한 볼륨", "강한 컬", "잦은 뿌리 염색", "매일 고데기"];

function selectedLabel<T extends string>(value: T, labels: Record<T, string>) {
  return [labels[value]];
}

type DiscoveryWorkbenchProps = { snapshot: ConsultationSnapshot; mutate: (patch: Omit<ConsultationPatch, "expectedVersion">, options?: { navigate?: boolean }) => Promise<unknown>; saving: boolean; interviewEnabled?: boolean };

export function DiscoveryWorkbench(props: DiscoveryWorkbenchProps) {
  return props.interviewEnabled ? <DiscoveryInterview {...props} /> : <DiscoveryFormWorkbench {...props} />;
}

function DiscoveryFormWorkbench({ snapshot, mutate, saving }: DiscoveryWorkbenchProps) {
  const [value, setValue] = useState<ConsultationInputProfile>(snapshot.discovery);
  const toggle = (key: "goals" | "treatmentHistory" | "desiredServices" | "allowedServices" | "avoid", item: string) => setValue((current) => ({ ...current, [key]: current[key].includes(item) ? current[key].filter((entry) => entry !== item) : [...current[key], item] }));
  const unavailableServices = value.desiredServices.filter((service) => service !== "아직 모름" && !value.allowedServices.includes(service));
  const hasMaintenanceTradeoff = value.changeLevel === "bold" && value.maintenanceLevel === "low";
  const complete = Boolean(
    value.purpose.trim()
    && value.goals.length
    && value.currentHair.trim()
    && value.hairLength
    && value.hairDensity
    && value.strandThickness
    && value.hairTexture
    && value.damageLevel
    && value.allowedServices.length
    && !unavailableServices.length
  );
  return <WorkbenchGrid input={
    <Panel className="grid gap-7 p-5 sm:p-7">
      <ChoiceGroup label="이번 상담 목적" values={PURPOSES} selected={[value.purpose]} multiple={false} onToggle={(purpose) => setValue({ ...value, purpose })} />
      <ChoiceGroup label="원하는 변화" values={GOALS} selected={value.goals} onToggle={(item) => toggle("goals", item)} />
      <TextField label="현재 모발 상태" value={value.currentHair} onChange={(currentHair) => setValue({ ...value, currentHair })} placeholder="예: 어깨 아래 길이, 잦은 염색으로 끝부분 손상" />
      <div className="grid gap-5 sm:grid-cols-2">
        <ChoiceGroup label="현재 길이" values={["짧음", "중간", "김"]} selected={[value.hairLength]} multiple={false} onToggle={(hairLength) => setValue({ ...value, hairLength })} />
        <ChoiceGroup label="모발 형태" values={["직모", "약한 웨이브", "곱슬"]} selected={[value.hairTexture]} multiple={false} onToggle={(hairTexture) => setValue({ ...value, hairTexture })} />
        <ChoiceGroup label="모발 양" values={["적음", "보통", "많음"]} selected={[value.hairDensity]} multiple={false} onToggle={(hairDensity) => setValue({ ...value, hairDensity })} />
        <ChoiceGroup label="모발 굵기" values={["가늘음", "보통", "굵음"]} selected={[value.strandThickness]} multiple={false} onToggle={(strandThickness) => setValue({ ...value, strandThickness })} />
        <ChoiceGroup label="손상 정도" values={["낮음", "보통", "높음"]} selected={[value.damageLevel]} multiple={false} onToggle={(damageLevel) => setValue({ ...value, damageLevel })} />
        <ChoiceGroup label="최근 시술 이력" values={["탈색", "염색", "펌", "매직·스트레이트"]} selected={value.treatmentHistory} onToggle={(item) => toggle("treatmentHistory", item)} />
      </div>
      <ChoiceGroup label="고려 중인 서비스" values={[...SERVICES, "아직 모름"]} selected={value.desiredServices} onToggle={(item) => toggle("desiredServices", item)} />
      <ChoiceGroup label="가능한 시술 범위" values={SERVICES} selected={value.allowedServices} onToggle={(item) => toggle("allowedServices", item)} />
      <ChoiceGroup label="가능한 관리 강도" values={["낮음", "보통", "높음"]} selected={[value.maintenanceLevel === "low" ? "낮음" : value.maintenanceLevel === "high" ? "높음" : "보통"]} multiple={false} onToggle={(item) => setValue({ ...value, maintenanceLevel: item === "낮음" ? "low" : item === "높음" ? "high" : "medium" })} />
      <div className="grid gap-5 sm:grid-cols-2">
        <ChoiceGroup label="아침 손질 가능 시간" values={["5분", "10분", "20분", "30분"]} selected={[`${value.morningMinutes}분`]} multiple={false} onToggle={(item) => setValue({ ...value, morningMinutes: Number(item.replace("분", "")) })} />
        <ChoiceGroup label="열기구 사용 빈도" values={["사용하지 않음", "가끔 가능", "자주 가능"]} selected={selectedLabel(value.heatStyling, { avoid: "사용하지 않음", sometimes: "가끔 가능", comfortable: "자주 가능" })} multiple={false} onToggle={(item) => setValue({ ...value, heatStyling: item === "사용하지 않음" ? "avoid" : item === "자주 가능" ? "comfortable" : "sometimes" })} />
        <ChoiceGroup label="변화 강도" values={["은은하게", "적당히", "과감하게"]} selected={selectedLabel(value.changeLevel, { subtle: "은은하게", moderate: "적당히", bold: "과감하게" })} multiple={false} onToggle={(item) => setValue({ ...value, changeLevel: item === "은은하게" ? "subtle" : item === "과감하게" ? "bold" : "moderate" })} />
        <ChoiceGroup label="미용실 방문 주기" values={["4주", "8주", "12주"]} selected={[`${value.salonCycleWeeks}주`]} multiple={false} onToggle={(item) => setValue({ ...value, salonCycleWeeks: Number(item.replace("주", "")) })} />
      </div>
      <ChoiceGroup label="피하고 싶은 것" values={AVOID} selected={value.avoid} onToggle={(item) => toggle("avoid", item)} />
      <TextField label="추가로 알려줄 내용" value={value.notes} onChange={(notes) => setValue({ ...value, notes })} />
      {unavailableServices.length ? <p role="alert" className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">고려 중인 시술과 가능한 범위가 충돌합니다: {unavailableServices.join(", ")}</p> : null}
      {hasMaintenanceTradeoff ? <p className="border border-[var(--app-warning)] bg-[var(--app-warning-bg)] p-3 text-sm">과감한 변화와 낮은 관리 강도를 함께 선택했습니다. AI는 관리 부담이 낮은 범위를 우선하고 해결되지 않은 차이를 상담 근거에 남깁니다.</p> : null}
      <SaveStageButton loading={saving} disabled={!complete} onClick={() => void mutate({ discovery: value, completeStage: "discovery", currentStage: "photo" })} />
    </Panel>
  } output={<>
    <SurfaceCard className="p-5 sm:p-6"><p className="app-kicker">Input Snapshot</p><h2 className="mt-3 text-xl font-black">생성과 살롱 브리프에 이어질 기준</h2><div className="mt-5"><DefinitionRows items={[
      { label: "Purpose", value: value.purpose || "선택 전" },
      { label: "Current hair", value: `${value.hairLength} · ${value.hairTexture} · 양 ${value.hairDensity} · 굵기 ${value.strandThickness} · 손상 ${value.damageLevel}` },
      { label: "Allowed services", value: value.allowedServices.join(", ") || "선택 전" },
      { label: "Maintenance", value: `아침 ${value.morningMinutes}분 · ${value.maintenanceLevel} · ${value.salonCycleWeeks}주 주기` },
      { label: "Change", value: selectedLabel(value.changeLevel, { subtle: "은은하게", moderate: "적당히", bold: "과감하게" })[0] },
      { label: "Avoid", value: value.avoid.join(", ") || "없음" },
    ]} /></div><p className="mt-5 text-sm leading-6 text-[var(--app-muted)]">이 snapshot은 05 전략과 06 이미지 생성 프롬프트의 명시적 제약으로 저장됩니다. 충돌하면 회피·손상·관리 조건을 우선합니다.</p></SurfaceCard>
    <ConsultationSystemData snapshot={snapshot} items={[
      { label: "Input readiness", value: complete ? "필수 입력 완료" : "필수 입력 대기" },
      { label: "Constraint conflict", value: unavailableServices.length ? `${unavailableServices.length}건 확인 필요` : "없음" },
    ]} />
  </>} />;
}
