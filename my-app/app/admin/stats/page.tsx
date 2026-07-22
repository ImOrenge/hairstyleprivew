"use client";

import { useEffect, useMemo, useState } from "react";
import type { GenerationNotificationOperationsSnapshot } from "../../../lib/generation-notification-operations";
import { mapWebResponseError } from "../../../lib/web-user-message";

type RangeDays = 7 | 30 | 90;

interface DailyRow {
  date: string;
  newUsers: number;
  generationsCompleted: number;
  reviews: number;
  b2bLeads: number;
  paidOrders: number;
  revenueKrw: number;
}

interface LeadStageRow {
  stage: "new" | "qualified" | "negotiation" | "contracted" | "dropped";
  count: number;
}

interface StatsResponse {
  rangeDays: RangeDays;
  window: {
    start: string;
    end: string;
  };
  kpis: {
    newUsers: number;
    paidOrders: number;
    revenueKrw: number;
    generationsCompleted: number;
    reviewsSubmitted: number;
    hiddenReviews: number;
    b2bLeads: number;
  };
  daily: DailyRow[];
  leadStages: LeadStageRow[];
  notificationOperations:
    | GenerationNotificationOperationsSnapshot
    | {
        health: "unavailable";
        sampledAt: string;
        error: string;
      };
  error?: string;
}

const rangeOptions: RangeDays[] = [7, 30, 90];

function formatKrw(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatMinutes(value: number | null | undefined) {
  if (value == null) return "-";
  if (value < 60) return `${value}분`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}

const notificationStatusLabels: Array<{
  key: keyof GenerationNotificationOperationsSnapshot["statusCounts"];
  label: string;
}> = [
  { key: "pending", label: "대기" },
  { key: "sending", label: "발송 중" },
  { key: "retry_wait", label: "재시도 대기" },
  { key: "sent", label: "발송 완료" },
  { key: "skipped", label: "발송 제외" },
  { key: "dead_letter", label: "재시도 종료" },
  { key: "delivery_unknown", label: "발송 여부 미확정" },
];

export default function AdminStatsPage() {
  const [range, setRange] = useState<RangeDays>(30);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const notificationOperations = stats?.notificationOperations ?? null;

  const url = useMemo(() => `/api/admin/stats?range=${range}`, [range]);
  const maxDaily = useMemo(() => {
    if (!stats?.daily?.length) return 1;
    return Math.max(
      1,
      ...stats.daily.map((item) =>
        Math.max(item.newUsers, item.generationsCompleted, item.reviews, item.b2bLeads, item.paidOrders),
      ),
    );
  }, [stats]);

  useEffect(() => {
    let mounted = true;

    async function loadStats() {
      const response = await fetch(url, { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as StatsResponse | null;
      if (!mounted) return;

      if (!response.ok || !data) {
        setError(mapWebResponseError(response.status, "통계 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
        setStats(null);
      } else {
        setStats(data);
      }

      setIsLoading(false);
    }

    void loadStats();
    return () => {
      mounted = false;
    };
  }, [url]);

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">관리자 대시보드</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">통계</h1>
        <p className="mt-2 text-sm text-stone-600">운영 지표를 최근 기간 기준으로 집계합니다.</p>

        <div className="mt-4 flex w-full overflow-x-auto rounded-xl border border-stone-200 bg-stone-50 p-1 sm:inline-flex sm:w-auto">
          {rangeOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                if (option === range) {
                  return;
                }
                setIsLoading(true);
                setError(null);
                setRange(option);
              }}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                option === range ? "bg-stone-900 text-white" : "text-stone-600"
              }`}
            >
              최근 {option}일
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">불러오는 중...</p>
      ) : null}

      {!isLoading && stats && notificationOperations ? (
        <>
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-500">신규 회원</p>
              <p className="mt-2 text-2xl font-black text-stone-950">{stats.kpis.newUsers}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-500">유료 결제</p>
              <p className="mt-2 text-2xl font-black text-stone-950">{stats.kpis.paidOrders}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-500">매출 (KRW)</p>
              <p className="mt-2 text-2xl font-black text-stone-950">{formatKrw(stats.kpis.revenueKrw)}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-500">완료 생성</p>
              <p className="mt-2 text-2xl font-black text-stone-950">{stats.kpis.generationsCompleted}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-500">리뷰 작성</p>
              <p className="mt-2 text-2xl font-black text-stone-950">{stats.kpis.reviewsSubmitted}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-500">숨김 리뷰</p>
              <p className="mt-2 text-2xl font-black text-stone-950">{stats.kpis.hiddenReviews}</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-500">B2B 리드</p>
              <p className="mt-2 text-2xl font-black text-stone-950">{stats.kpis.b2bLeads}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-5">
                {stats.leadStages.map((item) => (
                  <div key={item.stage} className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs">
                    <p className="font-semibold text-stone-600">{item.stage}</p>
                    <p className="text-base font-black text-stone-900">{item.count}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section
            className="rounded-2xl border border-stone-200 bg-white p-4"
            aria-labelledby="notification-operations-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">완료 이메일 운영</p>
                <h2 id="notification-operations-heading" className="mt-1 text-lg font-black text-stone-950">
                  생성 완료 알림 큐
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  발송 실패와 중복 위험을 generation 상태와 분리해 확인합니다.
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${
                  notificationOperations.health === "healthy"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : notificationOperations.health === "warning"
                      ? "bg-amber-50 text-amber-800 ring-amber-200"
                      : "bg-rose-50 text-rose-700 ring-rose-200"
                }`}
              >
                {notificationOperations.health === "healthy"
                  ? "정상"
                  : notificationOperations.health === "warning"
                    ? "확인 필요"
                    : notificationOperations.health === "critical"
                      ? "즉시 확인"
                      : "조회 불가"}
              </span>
            </div>

            {notificationOperations.health === "unavailable" ? (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
              >
                알림 큐 상태를 불러오지 못했습니다. migration과 관리자 service-role 연결을 확인해 주세요.
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                  {notificationStatusLabels.map((item) => (
                    <div key={item.key} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <p className="text-xs font-semibold text-stone-500">{item.label}</p>
                      <p className="mt-1 text-xl font-black text-stone-950">
                        {notificationOperations.statusCounts[item.key]}
                      </p>
                    </div>
                  ))}
                </div>

                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded-xl border border-stone-200 px-3 py-2">
                    <dt className="text-stone-500">처리 가능한 재시도</dt>
                    <dd className="mt-1 font-black text-stone-950">{notificationOperations.dueRetryCount}건</dd>
                  </div>
                  <div className="rounded-xl border border-stone-200 px-3 py-2">
                    <dt className="text-stone-500">만료된 발송 lease</dt>
                    <dd className="mt-1 font-black text-stone-950">{notificationOperations.expiredSendingCount}건</dd>
                  </div>
                  <div className="rounded-xl border border-stone-200 px-3 py-2">
                    <dt className="text-stone-500">가장 오래된 처리 가능 건</dt>
                    <dd className="mt-1 font-black text-stone-950">
                      {formatMinutes(notificationOperations.oldestActionable?.ageMinutes)}
                    </dd>
                  </div>
                </dl>

                {notificationOperations.alerts.length > 0 ? (
                  <div className="mt-4 space-y-2" aria-live="polite">
                    {notificationOperations.alerts.map((alert) => (
                      <div
                        key={alert.code}
                        role={alert.severity === "critical" ? "alert" : "status"}
                        className={`rounded-xl border px-4 py-3 text-sm ${
                          alert.severity === "critical"
                            ? "border-rose-200 bg-rose-50 text-rose-800"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                        }`}
                      >
                        <p className="font-black">{alert.message}</p>
                        <p className="mt-1 leading-6">{alert.operatorAction}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p
                    role="status"
                    className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"
                  >
                    현재 확인이 필요한 완료 이메일 큐 경보가 없습니다.
                  </p>
                )}

                <p className="mt-3 text-xs text-stone-500">
                  기준 시각 {new Date(notificationOperations.sampledAt).toLocaleString("ko-KR")} · 큐 지연 경고{" "}
                  {notificationOperations.thresholds.queueAgeWarningMinutes}분
                </p>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <h2 className="text-lg font-black text-stone-950">일별 추이</h2>
            <div className="mt-4 space-y-2">
              {stats.daily.map((row) => {
                const maxForRow = Math.max(
                  row.newUsers,
                  row.generationsCompleted,
                  row.reviews,
                  row.b2bLeads,
                  row.paidOrders,
                );
                const width = `${Math.max(2, (maxForRow / maxDaily) * 100)}%`;

                return (
                  <div key={row.date} className="rounded-lg border border-stone-100 bg-stone-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-stone-500">{row.date}</p>
                      <p className="text-xs text-stone-500">
                        회원 {row.newUsers} · 생성 {row.generationsCompleted} · 리뷰 {row.reviews} · B2B {row.b2bLeads}
                      </p>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-stone-200">
                      <div className="h-2 rounded-full bg-stone-900" style={{ width }} />
                    </div>
                    <p className="mt-2 text-xs text-stone-500">
                      결제 {row.paidOrders}건 / 매출 {formatKrw(row.revenueKrw)}원
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
