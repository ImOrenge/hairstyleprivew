"use client";

import { useEffect, useState } from "react";

const CONSENT_VERSION = "personal-color-training-v1";
type ConsentState = { granted: boolean; lastActionAt: string | null; productUseIndependent: true; sourceAssetsEnrolled: false };

export function PersonalColorTrainingConsent({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<ConsentState | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/consultations/${encodeURIComponent(sessionId)}/personal-color/training-consent`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<ConsentState> : null)
      .then((value) => { if (!cancelled) setState(value); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [sessionId]);
  if (!state) return null;
  const change = async (granted: boolean) => {
    setWorking(true); setMessage("");
    try {
      const response = await fetch(`/api/consultations/${encodeURIComponent(sessionId)}/personal-color/training-consent`, {
        method: granted ? "PUT" : "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(granted ? { accepted: true } : {}), consentVersion: CONSENT_VERSION, idempotencyKey: `${granted ? "grant" : "revoke"}:${crypto.randomUUID()}` }),
      });
      const value = await response.json() as ConsentState & { error?: string };
      if (!response.ok) throw new Error(value.error ?? "학습 동의를 저장하지 못했습니다.");
      setState(value); setMessage(granted ? "선택 동의를 저장했습니다." : "학습 동의를 철회했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "학습 동의를 저장하지 못했습니다."); }
    finally { setWorking(false); }
  };
  return <section className="mt-6 border-t border-[var(--app-border)] pt-5" data-training-consent-separated="true">
    <p className="app-kicker">Optional training consent</p>
    <h3 className="mt-2 text-base font-black">진단 이용과 별개인 선택 동의</h3>
    <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">동의하지 않아도 현재 진단과 상담을 그대로 이용합니다. 동의만으로 사진이 학습 데이터에 복사되지 않으며, 별도 검수·삭제 정책을 통과한 경우에만 향후 평가에 사용할 수 있습니다.</p>
    <label className="mt-3 flex min-h-11 items-start gap-3 text-sm font-bold"><input type="checkbox" className="mt-1" checked={state.granted} disabled={working} onChange={(event) => void change(event.target.checked)} />Personal Color 개선·평가를 위한 선택적 데이터 사용에 동의합니다.</label>
    {message ? <p className="mt-2 text-xs text-[var(--app-muted)]" aria-live="polite">{message}</p> : null}
  </section>;
}
