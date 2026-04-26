"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, LinkIcon, Plus, Search, UserRound } from "lucide-react";
import { Button } from "../ui/Button";
import type { SalonAftercareTask, SalonCustomer, SalonCustomerSource } from "../../lib/salon-crm-types";

interface CustomerListResponse {
  customers?: SalonCustomer[];
  pendingAftercare?: SalonAftercareTask[];
  summary?: {
    totalCustomers: number;
    linkedMembers: number;
    pendingAftercare: number;
    dueToday: number;
  };
  error?: string;
}

const emptySummary = {
  totalCustomers: 0,
  linkedMembers: 0,
  pendingAftercare: 0,
  dueToday: 0,
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
}

function sourceLabel(source: SalonCustomerSource) {
  return source === "linked_member" ? "회원 연결" : "수기 등록";
}

export function CustomerListClient() {
  const [customers, setCustomers] = useState<SalonCustomer[]>([]);
  const [pendingAftercare, setPendingAftercare] = useState<SalonAftercareTask[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | SalonCustomerSource>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    source: "manual" as SalonCustomerSource,
    linkedEmail: "",
    name: "",
    phone: "",
    email: "",
    memo: "",
    consentSms: false,
    consentKakao: false,
    nextFollowUpAt: "",
  });

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (source !== "all") {
      params.set("source", source);
    }
    const search = params.toString();
    return search ? `/api/salon/customers?${search}` : "/api/salon/customers";
  }, [query, source]);

  async function loadCustomers() {
    setIsLoading(true);
    setError(null);

    const response = await fetch(listUrl, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as CustomerListResponse;

    if (response.ok) {
      setCustomers(data.customers || []);
      setPendingAftercare(data.pendingAftercare || []);
      setSummary(data.summary || emptySummary);
    } else {
      setError(data.error || "고객 목록을 불러오지 못했습니다.");
    }

    setIsLoading(false);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCustomers();
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [listUrl]);

  async function handleSubmit() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/salon/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        nextFollowUpAt: form.nextFollowUpAt || null,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    if (response.ok) {
      setForm({
        source: "manual",
        linkedEmail: "",
        name: "",
        phone: "",
        email: "",
        memo: "",
        consentSms: false,
        consentKakao: false,
        nextFollowUpAt: "",
      });
      await loadCustomers();
    } else {
      setError(data.error || "고객을 등록하지 못했습니다.");
    }

    setIsSubmitting(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-stone-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Salon CRM</p>
          <h1 className="mt-2 text-2xl font-black tracking-normal text-stone-950">고객관리</h1>
        </div>
        <div className="grid gap-2 sm:grid-cols-4 lg:min-w-[560px]">
          <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
            <p className="text-xs text-stone-500">전체 고객</p>
            <p className="text-xl font-bold text-stone-950">{summary.totalCustomers}</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
            <p className="text-xs text-stone-500">회원 연결</p>
            <p className="text-xl font-bold text-stone-950">{summary.linkedMembers}</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
            <p className="text-xs text-stone-500">사후관리 대기</p>
            <p className="text-xl font-bold text-stone-950">{summary.pendingAftercare}</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
            <p className="text-xs text-stone-500">오늘까지</p>
            <p className="text-xl font-bold text-stone-950">{summary.dueToday}</p>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-4">
          <div className="flex flex-col gap-3 border-b border-stone-200 pb-4 md:flex-row md:items-center">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름, 전화번호, 이메일 검색"
                className="h-10 w-full rounded-md border border-stone-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-stone-950"
              />
            </label>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as "all" | SalonCustomerSource)}
              className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-stone-950"
            >
              <option value="all">전체 유입</option>
              <option value="manual">수기 등록</option>
              <option value="linked_member">회원 연결</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-md border border-stone-200 bg-white">
            <div className="grid grid-cols-[1.2fr_0.9fr_0.8fr_0.8fr_88px] border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs font-bold text-stone-500">
              <span>고객</span>
              <span>연락처</span>
              <span>최근 방문</span>
              <span>사후관리</span>
              <span className="text-right">상세</span>
            </div>

            {isLoading ? (
              <div className="px-4 py-10 text-center text-sm text-stone-500">불러오는 중...</div>
            ) : null}

            {!isLoading && customers.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-stone-500">등록된 고객이 없습니다.</div>
            ) : null}

            {customers.map((customer) => (
              <div
                key={customer.id}
                className="grid grid-cols-1 gap-3 border-b border-stone-100 px-4 py-4 text-sm last:border-b-0 md:grid-cols-[1.2fr_0.9fr_0.8fr_0.8fr_88px] md:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {customer.isLinkedMember ? (
                      <LinkIcon className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <UserRound className="h-4 w-4 text-stone-400" />
                    )}
                    <p className="truncate font-semibold text-stone-950">{customer.name}</p>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">{sourceLabel(customer.source)}</p>
                </div>
                <div className="min-w-0 text-stone-600">
                  <p className="truncate">{customer.phone || "-"}</p>
                  <p className="truncate text-xs text-stone-400">{customer.email || "-"}</p>
                </div>
                <p className="text-stone-600">{formatDate(customer.lastVisitAt)}</p>
                <div className="flex items-center gap-2 text-stone-600">
                  <Clock3 className="h-4 w-4 text-stone-400" />
                  <span>{formatDate(customer.nextFollowUpAt)}</span>
                </div>
                <Link
                  href={`/salon/customers/${customer.id}`}
                  className="rounded-md border border-stone-300 px-3 py-2 text-center text-xs font-semibold text-stone-800 hover:bg-stone-50 md:text-right"
                >
                  열기
                </Link>
              </div>
            ))}
          </div>
        </main>

        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-md border border-stone-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-stone-500" />
              <h2 className="text-sm font-bold text-stone-950">고객 등록</h2>
            </div>

            <div className="mt-4 grid gap-3">
              <select
                value={form.source}
                onChange={(event) =>
                  setForm((current) => ({ ...current, source: event.target.value as SalonCustomerSource }))
                }
                className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-stone-950"
              >
                <option value="manual">수기 등록</option>
                <option value="linked_member">기존 회원 연결</option>
              </select>

              {form.source === "linked_member" ? (
                <input
                  value={form.linkedEmail}
                  onChange={(event) => setForm((current) => ({ ...current, linkedEmail: event.target.value }))}
                  placeholder="연결할 회원 이메일"
                  className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
                />
              ) : null}

              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder={form.source === "linked_member" ? "표시 이름(비우면 회원명 사용)" : "고객 이름"}
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="전화번호"
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <input
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="이메일"
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <input
                type="datetime-local"
                value={form.nextFollowUpAt}
                onChange={(event) => setForm((current) => ({ ...current, nextFollowUpAt: event.target.value }))}
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <textarea
                value={form.memo}
                onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
                rows={4}
                placeholder="메모"
                className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-950"
              />
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={form.consentSms}
                  onChange={(event) => setForm((current) => ({ ...current, consentSms: event.target.checked }))}
                />
                문자 수신 동의
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={form.consentKakao}
                  onChange={(event) => setForm((current) => ({ ...current, consentKakao: event.target.checked }))}
                />
                카카오 알림 동의
              </label>
              <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "등록 중..." : "고객 등록"}
              </Button>
            </div>
          </section>

          <section className="rounded-md border border-stone-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-stone-500" />
              <h2 className="text-sm font-bold text-stone-950">다가오는 사후관리</h2>
            </div>
            <div className="mt-4 grid gap-2">
              {pendingAftercare.length === 0 ? (
                <p className="text-sm text-stone-500">대기 중인 사후관리가 없습니다.</p>
              ) : null}
              {pendingAftercare.slice(0, 6).map((task) => (
                <Link
                  key={task.id}
                  href={`/salon/customers/${task.customerId}`}
                  className="rounded-md border border-stone-200 px-3 py-2 text-sm hover:bg-stone-50"
                >
                  <p className="font-semibold text-stone-900">{formatDate(task.scheduledFor)} · {task.channel}</p>
                  <p className="mt-1 truncate text-xs text-stone-500">{task.note || "메모 없음"}</p>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
