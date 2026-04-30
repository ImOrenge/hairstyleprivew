"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

interface MemberDetailResponse {
  user?: Record<string, unknown>;
  profiles?: Record<string, unknown>;
  activity?: Record<string, Record<string, unknown>[]>;
  salon?: Record<string, Record<string, unknown>[]>;
  error?: string;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "-";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-4">
      <p className="text-xs font-bold uppercase text-stone-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-stone-950">{value}</p>
      {helper ? <p className="mt-1 text-xs text-stone-500">{helper}</p> : null}
    </div>
  );
}

function DataSection({
  title,
  rows,
  renderRow,
}: {
  title: string;
  rows: Record<string, unknown>[];
  renderRow: (row: Record<string, unknown>) => string;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <div className="border-b border-stone-200 px-4 py-3">
        <h2 className="text-sm font-bold text-stone-950">{title}</h2>
      </div>
      <div className="divide-y divide-stone-100">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-stone-500">데이터가 없습니다.</p>
        ) : null}
        {rows.map((row, index) => (
          <div key={String(row.id ?? index)} className="px-4 py-3">
            <p className="text-sm font-semibold text-stone-900">{renderRow(row)}</p>
            <p className="mt-1 text-xs text-stone-500">{formatDate(row.created_at)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AdminMemberDetailPage() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId || "";
  const [data, setData] = useState<MemberDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDetail() {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/members/${encodeURIComponent(userId)}`, {
        cache: "no-store",
      });
      const nextData = (await response.json().catch(() => ({}))) as MemberDetailResponse;

      if (!mounted) {
        return;
      }

      if (!response.ok) {
        setError(nextData.error || "회원 상세를 불러오지 못했습니다.");
        setData(null);
      } else {
        setData(nextData);
      }

      setIsLoading(false);
    }

    if (userId) {
      void loadDetail();
    }

    return () => {
      mounted = false;
    };
  }, [userId]);

  const user = data?.user ?? {};
  const activity = data?.activity ?? {};
  const salon = data?.salon ?? {};
  const generations = activity.generations ?? [];
  const stylingSessions = activity.stylingSessions ?? [];
  const hairRecords = activity.hairRecords ?? [];
  const payments = activity.payments ?? [];
  const creditLedger = activity.creditLedger ?? [];
  const subscriptions = activity.subscriptions ?? [];
  const salonCustomers = salon.customers ?? [];
  const salonAftercare = salon.aftercareTasks ?? [];

  const title = useMemo(() => {
    const displayName = asString(user.display_name);
    if (displayName !== "-") {
      return displayName;
    }

    return asString(user.email) !== "-" ? asString(user.email) : userId;
  }, [user.display_name, user.email, userId]);

  return (
    <div className="space-y-5 pb-10">
      <Link href="/admin/members" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-stone-950">
        <ArrowLeft className="h-4 w-4" />
        회원 목록
      </Link>

      <header className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Admin Member Detail</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">{title}</h1>
        <p className="mt-2 break-all text-sm text-stone-500">{userId}</p>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {isLoading ? <p className="text-sm text-stone-500">불러오는 중...</p> : null}

      {!isLoading && data ? (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <SummaryCard label="Role" value={asString(user.account_type)} helper={`Joined ${formatDate(user.created_at)}`} />
            <SummaryCard label="Credits" value={asNumber(user.credits).toLocaleString("ko-KR")} />
            <SummaryCard label="Hair" value={generations.length} helper="최근 생성" />
            <SummaryCard label="Salon CRM" value={salonCustomers.length} helper="최근 고객" />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <DataSection
              title="헤어 생성 기록"
              rows={generations}
              renderRow={(row) => `${asString(row.status)} · ${asString(row.prompt_used)}`}
            />
            <DataSection
              title="패션 추천 세션"
              rows={stylingSessions}
              renderRow={(row) => `${asString(row.status)} · ${asString(row.genre ?? row.occasion)}`}
            />
            <DataSection
              title="에프터케어 기록"
              rows={hairRecords}
              renderRow={(row) => `${asString(row.style_name)} · ${asString(row.service_type)}`}
            />
            <DataSection
              title="결제 내역"
              rows={payments}
              renderRow={(row) => `${asString(row.status)} · ${asNumber(row.amount).toLocaleString("ko-KR")}`}
            />
            <DataSection
              title="크레딧 원장"
              rows={creditLedger}
              renderRow={(row) => `${asString(row.entry_type)} · ${asNumber(row.amount).toLocaleString("ko-KR")} (${asNumber(row.balance_after).toLocaleString("ko-KR")})`}
            />
            <DataSection
              title="구독"
              rows={subscriptions}
              renderRow={(row) => `${asString(row.plan_key)} · ${asString(row.status)}`}
            />
            <DataSection
              title="살롱 고객"
              rows={salonCustomers}
              renderRow={(row) => `${asString(row.name)} · ${asString(row.phone)}`}
            />
            <DataSection
              title="살롱 사후관리"
              rows={salonAftercare}
              renderRow={(row) => `${asString(row.status)} · ${asString(row.channel)} · ${formatDate(row.scheduled_for)}`}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
