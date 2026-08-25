"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { PersonalColorProfileV2 } from "@hairfit/shared/personal-color-v2";
import type { PersonalColorDrapePairV2, PersonalColorDrapePreferenceV2, PersonalColorDrapeResponseV2, PersonalColorDrapeSessionV2 } from "@hairfit/shared/personal-color-v2";
import type { ConsultationPatch, ConsultationSnapshot } from "../../../lib/consulting/contracts";
import type { PersonalColorResult } from "../../../lib/fashion-types";
import { ConsultationPhotoEvidence } from "../photo/ConsultationPhotoEvidence";
import { PersonalColorResultDetails } from "../../personal-color/PersonalColorResultDetails";
import { PersonalColorTrainingConsent } from "../../personal-color/PersonalColorTrainingConsent";
import { ConsultationSystemData, DefinitionRows, Panel, SaveStageButton, SurfaceCard, WorkbenchGrid } from "./shared";

const TYPE_LABELS: Record<string, string> = {
  spring_light: "봄 라이트", spring_warm: "봄 웜", spring_bright: "봄 브라이트",
  summer_light: "여름 라이트", summer_cool: "여름 쿨", summer_muted: "여름 뮤트",
  autumn_muted: "가을 뮤트", autumn_warm: "가을 웜", autumn_deep: "가을 딥",
  winter_bright: "겨울 브라이트", winter_cool: "겨울 쿨", winter_deep: "겨울 딥",
};

const AXES = [
  ["temperature", "온도", "쿨", "웜"],
  ["value", "명도", "딥", "라이트"],
  ["chroma", "채도", "뮤트", "브라이트"],
  ["contrast", "대비", "로우", "하이"],
] as const;

function diagnosisTone(primaryType: string | null, temperature: number | null): PersonalColorResult["tone"] {
  if (primaryType?.startsWith("spring_") || primaryType?.startsWith("autumn_")) return "warm";
  if (primaryType?.startsWith("summer_") || primaryType?.startsWith("winter_")) return "cool";
  if (temperature !== null && temperature >= 0.58) return "warm";
  if (temperature !== null && temperature <= 0.42) return "cool";
  return "neutral";
}

function diagnosisContrast(value: number | null): PersonalColorResult["contrast"] {
  if (value !== null && value >= 0.67) return "high";
  if (value !== null && value <= 0.33) return "low";
  return "medium";
}

function legacyDetailResult(diagnosis: ConsultationSnapshot["personalColorDiagnosis"]): PersonalColorResult | null {
  if (!diagnosis.bestColors.length && !diagnosis.avoidColors.length) return null;
  return {
    detailVersion: diagnosis.detailVersion || undefined,
    tone: diagnosisTone(diagnosis.primaryType, diagnosis.axes.temperature),
    contrast: diagnosisContrast(diagnosis.axes.contrast),
    primaryType: diagnosis.primaryType as PersonalColorResult["primaryType"],
    secondaryType: diagnosis.secondaryType as PersonalColorResult["secondaryType"],
    blend: diagnosis.blend as PersonalColorResult["blend"],
    axes: diagnosis.axes.temperature === null || diagnosis.axes.value === null || diagnosis.axes.chroma === null || diagnosis.axes.contrast === null
      ? undefined
      : diagnosis.axes as PersonalColorResult["axes"],
    confidence: diagnosis.qualityConfidence ?? 0,
    bestColors: diagnosis.bestColors,
    avoidColors: diagnosis.avoidColors,
    stylingPalette: diagnosis.stylingPalette,
    hairColorHints: diagnosis.hairColorHints,
    summary: diagnosis.summary,
    diagnosedAt: diagnosis.completedAt || diagnosis.startedAt || "",
    model: diagnosis.model || "personal-color-evidence-v2",
  };
}

const V2_AXIS_LABELS: Record<keyof PersonalColorProfileV2["axes"], [string, string, string]> = {
  temperature: ["온도", "쿨", "웜"],
  value: ["명도", "딥", "라이트"],
  chroma: ["채도", "소프트", "비비드"],
  contrast: ["대비", "로우", "하이"],
  hueCharacter: ["색상 성격", "올리브·옐로", "레드·피치"],
};

function PersonalColorV2ProfilePanel({ sessionId, photoUrl }: { sessionId: string; photoUrl: string | null }) {
  const [profile, setProfile] = useState<PersonalColorProfileV2 | null>(null);
  const [drapeEnabled, setDrapeEnabled] = useState(false);
  const [drape, setDrape] = useState<PersonalColorDrapeSessionV2 | null>(null);
  const [pair, setPair] = useState<PersonalColorDrapePairV2 | null>(null);
  const [preference, setPreference] = useState<PersonalColorDrapePreferenceV2>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [drapeWorking, setDrapeWorking] = useState(false);
  const [drapeMessage, setDrapeMessage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/v2/consultations/${encodeURIComponent(sessionId)}/personal-color/profile`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ profile?: PersonalColorProfileV2; drapeEnabled?: boolean }> : null)
      .then((payload) => { if (!cancelled) { setProfile(payload?.profile ?? null); setDrapeEnabled(payload?.drapeEnabled === true); } })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
  }, [sessionId]);
  const startDrape = async () => {
    setDrapeWorking(true); setDrapeMessage(null);
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(sessionId)}/personal-color/drapes`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { session?: PersonalColorDrapeSessionV2; nextPair?: PersonalColorDrapePairV2 | null; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "드레이프 검증을 시작하지 못했습니다.");
      setDrape(payload.session); setPair(payload.nextPair ?? null); setPreference(null);
    } catch (error) { setDrapeMessage(error instanceof Error ? error.message : "드레이프 검증을 시작하지 못했습니다."); }
    finally { setDrapeWorking(false); }
  };
  const answerDrape = async (responseValue: PersonalColorDrapeResponseV2) => {
    if (!drape || !pair) return;
    setDrapeWorking(true); setDrapeMessage(null);
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(sessionId)}/personal-color/drapes/${encodeURIComponent(drape.id)}/responses`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: drape.revision, pairId: pair.id, response: responseValue, preference }),
      });
      const payload = (await response.json().catch(() => ({}))) as { session?: PersonalColorDrapeSessionV2; nextPair?: PersonalColorDrapePairV2 | null; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "드레이프 응답을 저장하지 못했습니다.");
      setDrape(payload.session); setPair(payload.nextPair ?? null); setPreference(null);
      setDrapeMessage(responseValue === "unsure" ? "잘 모르겠음은 확률을 바꾸지 않고 기록했습니다." : "조화 응답과 개인 취향을 분리해 저장했습니다.");
    } catch (error) { setDrapeMessage(error instanceof Error ? error.message : "드레이프 응답을 저장하지 못했습니다."); }
    finally { setDrapeWorking(false); }
  };
  const completeDrape = async (abandon: boolean) => {
    if (!drape) return;
    setDrapeWorking(true); setDrapeMessage(null);
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(sessionId)}/personal-color/drapes/${encodeURIComponent(drape.id)}/complete`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: drape.revision, abandon }),
      });
      const payload = (await response.json().catch(() => ({}))) as { session?: PersonalColorDrapeSessionV2; profile?: PersonalColorProfileV2 | null; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "드레이프 검증을 마치지 못했습니다.");
      setDrape(payload.session); setPair(null); if (payload.profile) setProfile(payload.profile);
      setDrapeMessage(abandon ? "드레이프 검증을 종료했습니다. 기존 프로필은 유지됩니다." : "드레이프 검증을 반영한 새 프로필을 확정했습니다.");
    } catch (error) { setDrapeMessage(error instanceof Error ? error.message : "드레이프 검증을 마치지 못했습니다."); }
    finally { setDrapeWorking(false); }
  };
  if (!profile) return null;
  const captureReliability = profile.regions.length
    ? profile.regions.reduce((sum, region) => sum + region.confidence, 0) / profile.regions.length
    : 0;
  return <Panel className="p-5" data-personal-color-profile-v2={profile.id}>
    <p className="app-kicker">퍼스널 컬러 분석 근거</p>
    <h2 className="mt-2 text-xl font-black">사진에서 확인한 색 특성을 따로 살펴볼 수 있어요</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="border border-[var(--app-border)] p-3"><p className="text-xs font-black">사진 관찰 신뢰도</p><strong className="mt-1 block text-2xl">{Math.round(captureReliability * 100)}%</strong></div>
      <div className="border border-[var(--app-border)] p-3"><p className="text-xs font-black">프로필 추론 신뢰도</p><strong className="mt-1 block text-2xl">{Math.round(profile.confidence.overall * 100)}%</strong></div>
    </div>
    <div className="mt-5 grid gap-3">{(Object.entries(profile.axes) as Array<[keyof PersonalColorProfileV2["axes"], PersonalColorProfileV2["axes"][keyof PersonalColorProfileV2["axes"]]]>).map(([key, axis]) => {
      const [label, low, high] = V2_AXIS_LABELS[key];
      return <div key={key} className="grid gap-1" data-axis-available={axis.value !== null}>
        <div className="flex flex-wrap justify-between gap-2 text-xs font-bold"><span>{label} · {low}</span><span>{axis.value === null ? `측정 보류 · ${axis.unavailableReason}` : `${high} · 신뢰도 ${Math.round(axis.confidence * 100)}%`}</span></div>
        {axis.value === null ? <div className="h-2 border border-dashed border-[var(--app-border-strong)]" aria-label={`${label} 측정 불가`} />
          : <meter min={-1} max={1} value={axis.value} className="w-full" aria-label={`${label} ${Math.round(axis.value * 100)}`} />}
      </div>;
    })}</div>
    <div className="mt-6">
      <p className="text-xs font-black uppercase">12타입 유사도</p>
      <div className="mt-3 grid gap-2">{profile.seasonalPosterior.map((item) => <div key={item.type} className="grid grid-cols-[minmax(8rem,1fr)_minmax(8rem,2fr)_3rem] items-center gap-2 text-xs">
        <span className="font-bold">{TYPE_LABELS[item.type] || item.type}</span>
        <meter min={0} max={1} value={item.probability} aria-label={`${TYPE_LABELS[item.type] || item.type} ${Math.round(item.probability * 100)}%`} className="w-full" />
        <strong className="text-right">{Math.round(item.probability * 100)}%</strong>
      </div>)}</div>
    </div>
    <details className="mt-6 border border-[var(--app-border)] p-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-black">기술 상세 보기</summary>
      <dl className="mt-2 grid gap-2 text-xs">
        <div><dt className="font-black">관찰 번들</dt><dd className="break-all text-[var(--app-muted)]">{profile.observationBundleId}</dd></div>
        <div><dt className="font-black">보정 방식</dt><dd>{profile.calibration.version} · D65 · {Math.round(profile.calibration.confidence * 100)}%</dd></div>
        <div><dt className="font-black">정책 버전</dt><dd>{profile.modelManifest.axisPolicyVersion} · {profile.modelManifest.posteriorVersion} · {profile.modelManifest.paletteVersion}</dd></div>
        <div><dt className="font-black">영역</dt><dd>{profile.regions.map((region) => `${region.region} ${Math.round(region.validPixelRatio * 100)}%`).join(" · ")}</dd></div>
      </dl>
    </details>
    <PersonalColorTrainingConsent sessionId={sessionId} />
    {drapeEnabled ? <div className="mt-6 border-t border-[var(--app-border)] pt-5" data-personal-color-drape="true">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase">색상 비교</p><h3 className="mt-1 text-lg font-black">같은 사진에서 얼굴이 더 자연스러운 색을 골라보세요</h3></div>
        {!drape ? <button type="button" className="app-button min-h-11" disabled={drapeWorking} onClick={() => void startDrape()}>색상 비교 시작</button> : null}
      </div>
      {profile.captureMode === "quick" && profile.confidence.typeConfidence < 0.6 ? <p className="mt-3 border-l-2 border-[var(--app-warning)] pl-3 text-sm">경계형 결과입니다. 자연광 보조 사진을 추가한 Precision 진단을 권장합니다.</p> : null}
      {drape && pair && photoUrl ? <div className="mt-5 grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><strong>{Math.min(10, new Set(drape.responses.map((item) => item.pairId)).size + 1)} / 10 비교</strong><button type="button" className="min-h-11 border px-3 font-black" aria-pressed={showOriginal} onClick={() => setShowOriginal((value) => !value)}>{showOriginal ? "색상 다시 보기" : "원본 보기"}</button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[pair.left, pair.right].map((color, index) => <div key={`${pair.id}-${color.colorId}`} className="border border-[var(--app-border)] p-2"><div className="relative aspect-[4/5] overflow-hidden bg-[var(--app-surface-muted)]"><Image unoptimized fill src={photoUrl} alt={`${color.label} 드레이프 비교 사진`} className="object-cover" />{!showOriginal ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[36%]" style={{ backgroundColor: color.hex }} aria-hidden="true" /> : null}</div><p className="mt-2 text-center text-sm font-black">{index === 0 ? "왼쪽" : "오른쪽"} · {color.label}</p></div>)}
        </div>
        <div><p className="text-xs font-black">개인 취향은 어느 쪽인가요? <span className="font-normal text-[var(--app-muted)]">조화 판정과 별도로 저장됩니다.</span></p><div className="mt-2 flex flex-wrap gap-2">{([['left','왼쪽이 취향'],['right','오른쪽이 취향'],['neither','둘 다 아님']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={preference === value} onClick={() => setPreference(value)} className={`min-h-11 border px-3 text-xs font-black ${preference === value ? "bg-[var(--app-inverse)] text-[var(--app-inverse-text)]" : ""}`}>{label}</button>)}</div></div>
        <div className="grid gap-2 sm:grid-cols-2"><button type="button" className="app-button min-h-12" disabled={drapeWorking} onClick={() => void answerDrape("left_better")}>왼쪽이 더 자연스러워요</button><button type="button" className="app-button min-h-12" disabled={drapeWorking} onClick={() => void answerDrape("right_better")}>오른쪽이 더 자연스러워요</button><button type="button" className="min-h-12 border px-3 font-black" disabled={drapeWorking} onClick={() => void answerDrape("no_meaningful_difference")}>의미 있는 차이가 없어요</button><button type="button" className="min-h-12 border px-3 font-black" disabled={drapeWorking} onClick={() => void answerDrape("unsure")}>잘 모르겠어요</button></div>
        <div className="flex flex-wrap gap-2"><button type="button" className="min-h-11 border px-3 text-xs font-black" disabled={drapeWorking} onClick={() => void completeDrape(false)}>여기서 결과 확정</button><button type="button" className="min-h-11 px-3 text-xs font-bold text-[var(--app-muted)]" disabled={drapeWorking} onClick={() => void completeDrape(true)}>검증 종료하고 기존 결과 유지</button></div>
        {drape.responses.length ? <details className="border border-[var(--app-border)] p-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-black">이전 답변 수정</summary><div className="mt-2 flex flex-wrap gap-2">{[...new Set(drape.responses.map((item) => item.pairId))].map((pairId) => <button type="button" key={pairId} className="min-h-11 border px-3 text-xs font-bold" onClick={() => setPair(drape.pairs.find((candidate) => candidate.id === pairId) ?? null)}>{pairId}</button>)}</div></details> : null}
      </div> : null}
      {drape && !pair ? <div className="mt-4 border border-[var(--app-border)] p-4"><p className="font-black">비교가 충분하거나 종료되었습니다.</p>{["sufficient_confidence", "active"].includes(drape.status) ? <button type="button" className="app-button mt-3 min-h-11" disabled={drapeWorking} onClick={() => void completeDrape(false)}>검증 결과로 프로필 확정</button> : null}</div> : null}
      {drapeMessage ? <p className="mt-3 text-sm text-[var(--app-muted)]" aria-live="polite">{drapeMessage}</p> : null}
    </div> : null}
  </Panel>;
}

export function PersonalColorWorkbench({ snapshot, mutate, saving }: {
  snapshot: ConsultationSnapshot;
  mutate: (patch: Omit<ConsultationPatch, "expectedVersion">) => Promise<unknown>;
  saving: boolean;
}) {
  const diagnosis = snapshot.personalColorDiagnosis;
  const blend = Object.entries(diagnosis.blend).sort((a, b) => b[1] - a[1]);
  const canUseResult = diagnosis.state === "ready";
  const detailedResult = legacyDetailResult(diagnosis);

  return <WorkbenchGrid
    inputLabel="퍼스널 컬러 진단 사진과 선택"
    outputLabel="퍼스널 컬러 AI 진단 결과"
    input={<div className="f-consulting-personal-color-input grid gap-4">
      {snapshot.photo.primaryUrl ? <SurfaceCard className="p-4"><p className="app-kicker">분석에 사용한 사진</p><div className="relative mt-3 aspect-[4/5] overflow-hidden bg-[var(--app-surface-muted)]"><Image unoptimized fill loading="eager" src={snapshot.photo.primaryUrl} alt="퍼스널 컬러 분석에 사용한 정면 사진" className="object-cover" /></div></SurfaceCard> : <ConsultationPhotoEvidence sessionId={snapshot.sessionId} enabled={snapshot.photo.usageScopes.includes("personalColor")} />}
      <Panel className="grid gap-4 p-5">
        <div><p className="app-kicker">진단 상태</p><h2 className="mt-2 text-xl font-black">사진 품질을 확인한 뒤 결과를 보여드려요</h2></div>
        <p className="text-sm leading-6 text-[var(--app-muted)]">진단은 사진 분석과 함께 자동 실행됩니다. 조명 신뢰도가 낮으면 결과를 확정값처럼 사용하지 않고 재촬영을 요청합니다.</p>
        {diagnosis.warnings.length ? <ul className="grid gap-2 text-sm">{diagnosis.warnings.map((warning) => <li key={warning} className="border-l-2 border-[var(--app-accent)] pl-3">{warning}</li>)}</ul> : null}
        {diagnosis.state === "retry-required" ? <Link className="app-button min-h-12" href={`/consulting/${snapshot.sessionId}/photo`}>사진 다시 준비하기</Link> : null}
        {!canUseResult && diagnosis.state !== "retry-required" ? <SaveStageButton loading={saving} onClick={() => void mutate({ personalColorDiagnosis: { ...diagnosis, state: "deferred", completedAt: new Date().toISOString(), errorCode: null, errorMessage: null } })}>이번에는 건너뛰기</SaveStageButton> : null}
      </Panel>
    </div>}
    output={<div className="f-consulting-personal-color-output grid gap-4">
      <PersonalColorV2ProfilePanel sessionId={snapshot.sessionId} photoUrl={snapshot.photo.primaryUrl} />
      <Panel className="p-5">
        <p className="app-kicker">내 퍼스널 컬러</p>
        <h2 className="mt-2 text-xl font-black">{diagnosis.primaryType ? TYPE_LABELS[diagnosis.primaryType] || diagnosis.primaryType : "진단 결과 준비 중"}</h2>
        {diagnosis.secondaryType ? <p className="mt-1 text-sm font-bold text-[var(--app-muted)]">보조 타입 · {TYPE_LABELS[diagnosis.secondaryType] || diagnosis.secondaryType}</p> : null}
        <p className="mt-2 text-sm text-[var(--app-muted)]">사진 기반 진단 신뢰도 · {diagnosis.qualityConfidence === null ? "확인 중" : `${Math.round(diagnosis.qualityConfidence * 100)}%`}</p>
        {diagnosis.summary ? <p className="mt-4 border-l-2 border-[var(--app-accent)] pl-3 text-sm leading-6 text-[var(--app-text)]">{diagnosis.summary}</p> : null}
        <div className="mt-5 grid gap-3">{AXES.map(([key, label, low, high]) => {
          const value = diagnosis.axes[key];
          return <div key={key} className="grid gap-1"><div className="flex justify-between text-xs font-bold"><span>{label} · {low}</span><span>{high}</span></div><meter min={0} max={1} value={value ?? 0.5} className="w-full" aria-label={`${label} ${value === null ? "분석 중" : Math.round(value * 100)}`} /></div>;
        })}</div>
      </Panel>
      <SurfaceCard className="p-5"><details><summary className="min-h-11 cursor-pointer py-2 text-sm font-black">다른 컬러 타입과의 유사도 보기</summary><div className="mt-4 grid gap-2">{blend.length ? blend.map(([type, score]) => <div key={type} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm"><span>{TYPE_LABELS[type] || type}</span><strong>{Math.round(score * 100)}%</strong></div>) : <p className="text-sm text-[var(--app-muted)]">12타입 유사도를 계산하고 있습니다.</p>}</div></details></SurfaceCard>
      <SurfaceCard className="p-5">
        <p className="app-kicker">추천·주의 팔레트</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><p className="text-xs font-black uppercase text-[var(--app-muted)]">추천 팔레트</p><div className="mt-2 flex flex-wrap gap-2" aria-label="추천 색상">{diagnosis.palette.best.map((hex) => <span key={hex} title={hex} className="h-12 w-12 border border-[var(--app-border)]" style={{ background: hex }} />)}</div></div>
          <div><p className="text-xs font-black uppercase text-[var(--app-muted)]">주의 팔레트</p><div className="mt-2 flex flex-wrap gap-2" aria-label="주의 색상">{diagnosis.palette.caution.map((hex) => <span key={hex} title={hex} className="h-12 w-12 border border-[var(--app-border)]" style={{ background: hex }} />)}</div></div>
        </div>
        {diagnosis.palette.metals.length ? <p className="mt-4 text-sm text-[var(--app-muted)]">추천 금속 · <strong className="text-[var(--app-text)]">{diagnosis.palette.metals.join(" · ")}</strong></p> : null}
      </SurfaceCard>
      {detailedResult ? <SurfaceCard className="p-5"><p className="app-kicker">실제 활용법</p><h3 className="mt-2 text-lg font-black">색상별 활용 가이드</h3><div className="mt-5"><PersonalColorResultDetails result={detailedResult} showOverview={false} showHairColorHints={false} /></div></SurfaceCard> : null}
      <SurfaceCard className="p-5"><p className="app-kicker">염색 추천 방향</p><h3 className="mt-2 text-lg font-black">퍼스널 컬러를 헤어 컬러로 연결해요</h3><div className="mt-5"><DefinitionRows items={diagnosis.hairColorDirections.map((item) => ({ label: item.name, value: item.reason }))} /></div>{diagnosis.hairColorDirections.length ? <details className="mt-4 border-t border-[var(--app-border)] pt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-black">디자이너용 시술 범위 보기</summary><DefinitionRows items={diagnosis.hairColorDirections.map((item) => ({ label: item.name, value: `목표 레벨 ${item.targetLevel ?? "현장 확인"} · 탈색 ${item.bleachPolicy} · 유지 ${item.maintenance}` }))} /></details> : null}</SurfaceCard>
      <ConsultationSystemData snapshot={snapshot} items={[{ label: "진단 근거", value: diagnosis.evidenceId ? "연결됨" : "없음" }, { label: "사진 품질", value: diagnosis.qualityStatus }]} />
    </div>}
  />;
}
