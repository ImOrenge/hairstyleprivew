"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConsultationSnapshot } from "../../lib/consulting/contracts";
import { CONSULTATION_STAGE_DEFINITIONS, consultationStageHref } from "../../lib/consulting/routes";
import { mapWebResponseError, mapWebUserError } from "../../lib/web-user-message";
import { Button, buttonClassName } from "../ui/Button";

export function ConsultingEntry({ latest }: { latest: ConsultationSnapshot | null }) {
  const startFailureCopy = "상담을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recommendedDefinition = latest
    ? CONSULTATION_STAGE_DEFINITIONS.find((definition) => definition.slug === latest.journey.recommendedStage)
    : null;
  const start = async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/consultations", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { snapshot?: ConsultationSnapshot };
      if (!response.ok || !data.snapshot) {
        setError(mapWebResponseError(response.status, startFailureCopy));
        setLoading(false);
        return;
      }
      router.replace(consultationStageHref(data.snapshot.sessionId, "discovery"));
    } catch (cause) {
      setError(mapWebUserError(cause, startFailureCopy));
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-6xl items-center px-4 py-10 sm:px-6">
      <div className="grid w-full overflow-hidden border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex min-h-[26rem] flex-col justify-between bg-[var(--app-inverse)] p-7 text-[var(--app-inverse-text)] sm:p-10 lg:min-h-[38rem]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--app-accent)]">HairFit Private AI Atelier</p>
            <h1 className="mt-6 text-4xl font-black leading-[0.96] tracking-[-0.055em] sm:text-6xl">
              미리보기를 넘어
              <br />
              결정까지 함께합니다.
            </h1>
          </div>
          <p className="mt-10 max-w-md border-l border-[var(--app-accent)] pl-4 text-sm leading-7 text-[color:rgba(244,241,232,0.72)] sm:text-base">
            기존 상담의 질문과 단계는 그대로 유지됩니다. 저장된 상담은 마지막 진행 지점에서 안전하게 이어집니다.
          </p>
        </section>

        <section className="flex flex-col justify-center p-7 sm:p-10">
          <p className="app-kicker">New consultation</p>
          <h2 className="mt-4 text-2xl font-black tracking-[-0.035em] text-[var(--app-text)] sm:text-3xl">
            필요한 질문만 차분하게,
            <br />
            결과는 한 번에 확인하세요.
          </h2>
          <p className="mt-5 text-sm leading-7 text-[var(--app-muted)] sm:text-base">
            사진을 먼저 분석하고, 결과를 바꿀 목표와 시술 이력만 짧게 확인합니다. 분석 근거를 바탕으로 9개 전략형 프리뷰를 비교하고, 선택한 스타일은 살롱 브리프·애프터케어·퍼스널 컬러·메이크업·패션까지 같은 상담 맥락으로 이어집니다.
          </p>

          <ol className="mt-7 grid gap-3 border-y border-[var(--app-border)] py-5 text-sm text-[var(--app-muted)]">
            <li className="grid grid-cols-[2rem_1fr] items-start gap-2"><strong className="text-[var(--app-accent-strong)]">01</strong><span>얼굴과 현재 스타일 사진 분석</span></li>
            <li className="grid grid-cols-[2rem_1fr] items-start gap-2"><strong className="text-[var(--app-accent-strong)]">02</strong><span>목표와 현실적인 관리 조건 확인</span></li>
            <li className="grid grid-cols-[2rem_1fr] items-start gap-2"><strong className="text-[var(--app-accent-strong)]">03</strong><span>헤어·컬러·메이크업·패션 통합 결과</span></li>
          </ol>

          {error ? (
            <p className="mt-5 border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {latest ? (
              <Link
                href={consultationStageHref(latest.sessionId, latest.journey.recommendedStage)}
                className={buttonClassName("primary", "min-h-12 text-center")}
              >
                상담 이어하기 · {recommendedDefinition?.title ?? "저장된 단계"}
              </Link>
            ) : null}
            <Button
              type="button"
              variant={latest ? "secondary" : "primary"}
              loading={loading}
              onClick={() => void start()}
              className="min-h-12"
            >
              새 AI 상담 시작
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
