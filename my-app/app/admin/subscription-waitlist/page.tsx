"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { mapWebResponseError } from "../../../lib/web-user-message";

type WaitlistStatus = "pending" | "notified" | "converted" | "dismissed";
type WaitlistPlanKey = "basic" | "standard" | "pro";

interface WaitlistEntryRow {
  id: string;
  user_id: string | null;
  email: string;
  plan_key: WaitlistPlanKey;
  status: WaitlistStatus;
  source_path: string | null;
  use_case: string | null;
  last_submitted_at: string;
  notified_at: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WaitlistListResponse {
  entries?: WaitlistEntryRow[];
  error?: string;
}

const statusOptions: Array<"all" | WaitlistStatus> = [
  "pending",
  "notified",
  "converted",
  "dismissed",
  "all",
];

const planOptions: Array<"all" | WaitlistPlanKey> = ["all", "basic", "standard", "pro"];

const statusLabels: Record<"all" | WaitlistStatus, string> = {
  all: "전체",
  pending: "대기",
  notified: "안내 완료",
  converted: "전환",
  dismissed: "제외",
};

const planLabels: Record<"all" | WaitlistPlanKey, string> = {
  all: "전체 플랜",
  basic: "Basic",
  standard: "Standard",
  pro: "Pro",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusTone(status: WaitlistStatus) {
  if (status === "converted") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "dismissed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "notified") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-stone-200 bg-stone-50 text-stone-700";
}

export default function AdminSubscriptionWaitlistPage() {
  const [status, setStatus] = useState<"all" | WaitlistStatus>("pending");
  const [planKey, setPlanKey] = useState<"all" | WaitlistPlanKey>("all");
  const [entries, setEntries] = useState<WaitlistEntryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("status", status);
    params.set("planKey", planKey);
    return `/api/admin/subscription-waitlist?${params.toString()}`;
  }, [planKey, status]);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const response = await fetch(listUrl, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as WaitlistListResponse;
    if (!response.ok) {
      setError(mapWebResponseError(response.status, "오픈 알림 신청 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setIsLoading(false);
      return;
    }

    setEntries(data.entries ?? []);
    setIsLoading(false);
  }, [listUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadEntries();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadEntries]);

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">구독 오픈 알림</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">구독 오픈 알림 신청</h1>
        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((item) => (
              <Button
                key={item}
                type="button"
                variant={status === item ? "primary" : "secondary"}
                onClick={() => setStatus(item)}
                className="h-9 rounded-lg px-3 text-xs"
              >
                {statusLabels[item]}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {planOptions.map((item) => (
              <Button
                key={item}
                type="button"
                variant={planKey === item ? "primary" : "secondary"}
                onClick={() => setPlanKey(item)}
                className="h-9 rounded-lg px-3 text-xs"
              >
                {planLabels[item]}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">
          오픈 알림 신청 목록을 불러오는 중...
        </p>
      ) : null}

      {!isLoading && entries.length === 0 ? (
        <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-sm text-stone-500">
          표시할 오픈 알림 신청이 없습니다.
        </p>
      ) : null}

      <section className="grid gap-3">
        {entries.map((entry) => (
          <article key={entry.id} className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusTone(entry.status)}`}>
                    {statusLabels[entry.status]}
                  </span>
                  <span className="rounded-full border border-stone-200 px-2 py-1 text-xs font-bold text-stone-500">
                    {planLabels[entry.plan_key]}
                  </span>
                </div>
                <p className="mt-3 break-all text-lg font-black text-stone-950">{entry.email}</p>
                <p className="mt-1 break-all text-xs text-stone-500">
                  사용자 {entry.user_id || "-"} / 신청 {formatDate(entry.last_submitted_at)}
                </p>
                {entry.source_path ? (
                  <p className="mt-1 break-all text-xs text-stone-500">유입 {entry.source_path}</p>
                ) : null}
                {entry.use_case ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">{entry.use_case}</p>
                ) : null}
              </div>
              <div className="grid gap-1 text-right text-xs leading-5 text-stone-500">
                <p>생성 {formatDate(entry.created_at)}</p>
                <p>갱신 {formatDate(entry.updated_at)}</p>
                {entry.notified_at ? <p>안내 {formatDate(entry.notified_at)}</p> : null}
                {entry.converted_at ? <p>전환 {formatDate(entry.converted_at)}</p> : null}
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
