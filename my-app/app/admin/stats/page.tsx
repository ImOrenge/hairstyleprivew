"use client";

import { useEffect, useMemo, useState } from "react";

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
  error?: string;
}

const rangeOptions: RangeDays[] = [7, 30, 90];

function formatKrw(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export default function AdminStatsPage() {
  const [range, setRange] = useState<RangeDays>(30);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError(data?.error || "통계 데이터를 불러오지 못했습니다.");
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
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Admin Dashboard</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">통계</h1>
        <p className="mt-2 text-sm text-stone-600">운영 지표를 최근 기간 기준으로 집계합니다.</p>

        <div className="mt-4 inline-flex rounded-xl border border-stone-200 bg-stone-50 p-1">
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
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                option === range ? "bg-stone-900 text-white" : "text-stone-600"
              }`}
            >
              최근 {option}일
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">불러오는 중...</p>
      ) : null}

      {!isLoading && stats ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:col-span-2">
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
