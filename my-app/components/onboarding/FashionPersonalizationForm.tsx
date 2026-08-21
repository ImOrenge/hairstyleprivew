"use client";

import type { FashionPolicyCoverageV1, UserFashionPersonalizationPolicyV1 } from "@hairfit/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../ui/Button";

type ResponseState = {
  policy: UserFashionPersonalizationPolicyV1;
  coverage: FashionPolicyCoverageV1;
  learningResetAt: string | null;
};

function split(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function FashionPersonalizationForm({ returnTo, initialState = null, readOnlyPreview = false }: { returnTo: string; initialState?: ResponseState | null; readOnlyPreview?: boolean }) {
  const [state, setState] = useState<ResponseState | null>(initialState);
  const [topSize, setTopSize] = useState("");
  const [bottomSize, setBottomSize] = useState("");
  const [sizeFlexibleOnly, setSizeFlexibleOnly] = useState(false);
  const [fits, setFits] = useState<string[]>([]);
  const [fitAny, setFitAny] = useState(false);
  const [avoid, setAvoid] = useState("");
  const [sensitivities, setSensitivities] = useState("");
  const [accessibility, setAccessibility] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [preferredBrands, setPreferredBrands] = useState("");
  const [avoidedBrands, setAvoidedBrands] = useState("");
  const [learningConsent, setLearningConsent] = useState(false);
  const [constraintsConfirmed, setConstraintsConfirmed] = useState(false);
  const [busy, setBusy] = useState<"loading" | "saving" | "confirming" | "resetting" | null>(initialState ? null : "loading");
  const [message, setMessage] = useState<string | null>(null);

  const hydrate = (next: ResponseState) => {
    setState(next);
    const top = next.policy.sizeProfile.find((item) => item.category === "top");
    const bottom = next.policy.sizeProfile.find((item) => item.category === "bottom");
    setTopSize(top?.value ?? "");
    setBottomSize(bottom?.value ?? "");
    setSizeFlexibleOnly(next.policy.avoidRules.includes("size-flexible-only"));
    setFits(next.policy.fitPreferences);
    setFitAny(next.policy.avoidRules.includes("fit-any"));
    setConstraintsConfirmed(next.policy.avoidRules.includes("constraints-confirmed"));
    setAvoid(next.policy.avoidRules.filter((item) => !["size-flexible-only", "fit-any", "constraints-confirmed"].includes(item)).join(", "));
    setSensitivities(next.policy.materialSensitivities.join(", "));
    setAccessibility(next.policy.accessibilityNeeds.join(", "));
    setBudgetMin(next.policy.baselineBudget.minKrw?.toString() ?? "");
    setBudgetMax(next.policy.baselineBudget.maxKrw?.toString() ?? "");
    setPreferredBrands(next.policy.preferredBrands.join(", "));
    setAvoidedBrands(next.policy.avoidedBrands.join(", "));
    setLearningConsent(next.policy.learningConsent);
  };

  useEffect(() => {
    if (initialState) return;
    let active = true;
    void fetch("/api/v2/me/onboarding/fashion-personalization", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as ResponseState & { error?: string };
        if (!response.ok) throw new Error(data.error || "개인화 정책을 불러오지 못했습니다.");
        if (active) { hydrate(data); setMessage(null); }
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "개인화 정책을 불러오지 못했습니다."); })
      .finally(() => { if (active) setBusy(null); });
    return () => { active = false; };
  }, [initialState]);

  const save = async () => {
    if (!state) return;
    setBusy("saving"); setMessage(null);
    const sizeProfile = [
      ...(topSize.trim() ? [{ category: "top", system: "KR", value: topSize.trim(), source: "user-entered" }] : []),
      ...(bottomSize.trim() ? [{ category: "bottom", system: "KR", value: bottomSize.trim(), source: "user-entered" }] : []),
    ];
    try {
      const response = await fetch("/api/v2/me/onboarding/fashion-personalization", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: state.policy.revision,
          patch: {
            sizeProfile, sizeFlexibleOnly, fitPreferences: fits, fitAny,
            avoidRules: split(avoid), materialSensitivities: split(sensitivities),
            accessibilityNeeds: split(accessibility), constraintsConfirmed,
            baselineBudget: { minKrw: budgetMin || null, maxKrw: budgetMax || null },
            preferredBrands: split(preferredBrands), avoidedBrands: split(avoidedBrands), learningConsent,
          },
        }),
      });
      const data = await response.json().catch(() => ({})) as ResponseState & { error?: string };
      if (!response.ok) throw new Error(data.error || "개인화 정책을 저장하지 못했습니다.");
      hydrate(data); setMessage("개인화 정책을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "개인화 정책을 저장하지 못했습니다.");
    } finally { setBusy(null); }
  };

  const confirm = async () => {
    if (!state) return;
    setBusy("confirming"); setMessage(null);
    try {
      const response = await fetch("/api/v2/me/onboarding/fashion-personalization/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: state.policy.revision }),
      });
      const data = await response.json().catch(() => ({})) as ResponseState & { error?: string };
      if (!response.ok) throw new Error(data.error || "개인화 정책을 확정하지 못했습니다.");
      hydrate(data); setMessage("패션 개인화 준비가 완료되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "개인화 정책을 확정하지 못했습니다.");
    } finally { setBusy(null); }
  };

  const resetLearning = async () => {
    setBusy("resetting"); setMessage(null);
    try {
      const response = await fetch("/api/v2/me/onboarding/fashion-personalization/reset-learning", { method: "POST" });
      const data = await response.json().catch(() => ({})) as ResponseState & { error?: string };
      if (!response.ok) throw new Error(data.error || "학습 기록을 초기화하지 못했습니다.");
      hydrate(data); setMessage("앞으로의 추천에 사용할 학습 기준을 초기화했습니다. 과거 리포트는 바뀌지 않습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "학습 기록을 초기화하지 못했습니다.");
    } finally { setBusy(null); }
  };

  if (busy === "loading") return <p role="status" className="p-6 text-sm text-[var(--app-muted)]">패션 개인화 설정을 불러오는 중입니다.</p>;
  if (!state) return <p role="alert" className="p-6 text-sm text-[var(--app-danger)]">{message || "개인화 설정을 사용할 수 없습니다."}</p>;

  const complete = state.coverage.complete;
  const confirmed = state.policy.confirmedRevision === state.policy.revision;
  return <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
    <header className="border-b border-[var(--app-border)] pb-5">
      <p className="app-kicker">Persistent fashion policy</p>
      <h1 className="mt-2 text-3xl font-black">패션 개인화 기준</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">반복해서 묻지 않을 지속 기준만 저장합니다. 이번 일정·드레스코드·일회 예산은 상담에서 별도로 확인합니다.</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
        <span className="border border-[var(--app-border)] px-3 py-2">스타일 타깃 · {state.policy.styleTarget || "미설정"}</span>
        <span className="border border-[var(--app-border)] px-3 py-2">revision {state.policy.revision}</span>
        <span className="border border-[var(--app-border)] px-3 py-2">{confirmed ? "확정됨" : complete ? "확정 가능" : "필수 입력 남음"}</span>
      </div>
    </header>

    <div className="mt-6 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
      <aside className="border border-[var(--app-border)] p-5">
        <p className="app-kicker">Coverage</p>
        <ul className="mt-4 grid gap-3 text-sm">
          {[
            ["size", "사이즈 또는 사이즈 무관"],
            ["fit", "핏 또는 상관없음"],
            ["avoid-accessibility", "회피·민감도·접근성 확인"],
          ].map(([key, label]) => {
            const done = !state.coverage.missing.includes(key as FashionPolicyCoverageV1["missing"][number]);
            return <li key={key} className="flex items-center gap-3"><span aria-hidden="true" className="font-black">{done ? "✓" : "○"}</span><span>{label}</span><span className="sr-only">{done ? "완료" : "미완료"}</span></li>;
          })}
        </ul>
        <p className="mt-5 text-xs leading-5 text-[var(--app-muted)]">사진으로 사이즈·체중·성별·접근성 조건을 추론하지 않습니다. 모든 값은 사용자가 직접 입력한 값만 사용합니다.</p>
      </aside>

      <div className="grid gap-5">
        <section className="border border-[var(--app-border)] p-5">
          <h2 className="text-lg font-black">사이즈와 핏</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-black">상의 사이즈<input className="app-input min-h-11 px-3 font-normal" value={topSize} disabled={sizeFlexibleOnly} onChange={(event) => setTopSize(event.target.value)} placeholder="95, 100, M" /></label>
            <label className="grid gap-2 text-sm font-black">하의 사이즈<input className="app-input min-h-11 px-3 font-normal" value={bottomSize} disabled={sizeFlexibleOnly} onChange={(event) => setBottomSize(event.target.value)} placeholder="28, 30, M" /></label>
          </div>
          <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={sizeFlexibleOnly} onChange={(event) => setSizeFlexibleOnly(event.target.checked)} />사이즈 무관 추천만 받기</label>
          <div className="mt-4 flex flex-wrap gap-2">{["slim","regular","relaxed","oversized"].map((fit) => <button type="button" key={fit} aria-pressed={fits.includes(fit)} className="min-h-11 border border-[var(--app-border)] px-4 text-sm font-black data-[active=true]:bg-[var(--app-inverse)] data-[active=true]:text-[var(--app-inverse-text)]" data-active={fits.includes(fit)} onClick={() => { setFitAny(false); setFits((current) => current.includes(fit) ? current.filter((item) => item !== fit) : [...current, fit]); }}>{fit}</button>)}</div>
          <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={fitAny} onChange={(event) => { setFitAny(event.target.checked); if (event.target.checked) setFits([]); }} />핏은 상관없음</label>
        </section>

        <section className="border border-[var(--app-border)] p-5">
          <h2 className="text-lg font-black">금지·민감도·접근성</h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm font-black">피하고 싶은 품목·색·표현<input className="app-input min-h-11 px-3 font-normal" value={avoid} onChange={(event) => setAvoid(event.target.value)} placeholder="스키니진, color:neon, 깊은 넥라인" /></label>
            <label className="grid gap-2 text-sm font-black">민감 소재<input className="app-input min-h-11 px-3 font-normal" value={sensitivities} onChange={(event) => setSensitivities(event.target.value)} placeholder="울, 라텍스" /></label>
            <label className="grid gap-2 text-sm font-black">접근성·착탈 조건<input className="app-input min-h-11 px-3 font-normal" value={accessibility} onChange={(event) => setAccessibility(event.target.value)} placeholder="한 손으로 여밈, 부드러운 허리밴드" /></label>
          </div>
          <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={constraintsConfirmed} onChange={(event) => setConstraintsConfirmed(event.target.checked)} />추가 회피·민감도·접근성 조건이 없거나 위에 모두 적었습니다.</label>
        </section>

        <section className="border border-[var(--app-border)] p-5">
          <h2 className="text-lg font-black">선택 개인화</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-black">기본 최소 예산<input type="number" min={0} className="app-input min-h-11 px-3 font-normal" value={budgetMin} onChange={(event) => setBudgetMin(event.target.value)} /></label>
            <label className="grid gap-2 text-sm font-black">기본 최대 예산<input type="number" min={0} className="app-input min-h-11 px-3 font-normal" value={budgetMax} onChange={(event) => setBudgetMax(event.target.value)} /></label>
            <label className="grid gap-2 text-sm font-black">선호 브랜드<input className="app-input min-h-11 px-3 font-normal" value={preferredBrands} onChange={(event) => setPreferredBrands(event.target.value)} /></label>
            <label className="grid gap-2 text-sm font-black">피할 브랜드<input className="app-input min-h-11 px-3 font-normal" value={avoidedBrands} onChange={(event) => setAvoidedBrands(event.target.value)} /></label>
          </div>
          <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={learningConsent} onChange={(event) => setLearningConsent(event.target.checked)} />명시적으로 남긴 좋아요·별로예요 피드백을 미래 추천에 사용</label>
          <Button type="button" variant="secondary" className="mt-3" disabled={busy !== null || readOnlyPreview} onClick={() => void resetLearning()}>{busy === "resetting" ? "초기화 중" : "개인화 학습 초기화"}</Button>
          {state.learningResetAt ? <p className="mt-2 text-xs text-[var(--app-muted)]">최근 초기화 · {new Date(state.learningResetAt).toLocaleString("ko-KR")}</p> : null}
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--app-border)] pt-5">
          <Button type="button" disabled={busy !== null || readOnlyPreview} onClick={() => void save()}>{busy === "saving" ? "저장 중" : "설정 저장"}</Button>
          <Button type="button" variant="secondary" disabled={busy !== null || readOnlyPreview || !complete || confirmed} onClick={() => void confirm()}>{busy === "confirming" ? "확정 중" : confirmed ? "확정 완료" : "개인화 기준 확정"}</Button>
          {confirmed ? <Link href={returnTo} className="inline-flex min-h-11 items-center border border-[var(--app-border-strong)] px-4 text-sm font-black">상담으로 돌아가기</Link> : null}
          {message ? <p role="status" aria-live="polite" className="w-full text-sm">{message}</p> : null}
        </div>
      </div>
    </div>
  </main>;
}
