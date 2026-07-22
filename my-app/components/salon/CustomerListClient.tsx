"use client";

import Link from "next/link";
import { LatestRequestGuard } from "@hairfit/api-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, Copy, LinkIcon, Plus, RefreshCw, Search, UserRound, UsersRound } from "lucide-react";
import { Button } from "../ui/Button";
import { ConfirmActionDialog } from "../ui/ConfirmActionDialog";
import { useAdminReadOnly } from "../../hooks/useAdminReadOnly";
import { mapWebResponseError } from "../../lib/web-user-message";
import type {
  SalonAftercareTask,
  SalonCustomer,
  SalonCustomerSource,
  SalonMatchCandidate,
  SalonMatchInvite,
} from "../../lib/salon-crm-types";

interface CustomerListResponse {
  customers?: SalonCustomer[];
  pendingAftercare?: SalonAftercareTask[];
  summary?: {
    totalCustomers: number;
    linkedMembers: number;
    pendingAftercare: number;
    dueToday: number;
  };
  total?: number;
  nextCursor?: string | null;
  error?: string;
}

interface MatchInviteResponse {
  invite?: SalonMatchInvite | null;
  error?: string;
}

interface MatchCandidateResponse {
  candidates?: SalonMatchCandidate[];
  limit?: number;
  nextCursor?: string | null;
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
  const { isAdminReadOnly, isRoleLoaded } = useAdminReadOnly();
  const [customers, setCustomers] = useState<SalonCustomer[]>([]);
  const [pendingAftercare, setPendingAftercare] = useState<SalonAftercareTask[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | SalonCustomerSource>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInviteLoading, setIsInviteLoading] = useState(true);
  const [isCandidateLoading, setIsCandidateLoading] = useState(true);
  const [linkingRequestId, setLinkingRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<SalonMatchInvite | null>(null);
  const [matchQuery, setMatchQuery] = useState("");
  const [candidates, setCandidates] = useState<SalonMatchCandidate[]>([]);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [candidateCurrentCursor, setCandidateCurrentCursor] = useState<string | null>(null);
  const [candidateNextCursor, setCandidateNextCursor] = useState<string | null>(null);
  const [candidateCursorHistory, setCandidateCursorHistory] = useState<(string | null)[]>([]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [reissueConfirmOpen, setReissueConfirmOpen] = useState(false);
  const customerListAbortController = useRef<AbortController | null>(null);
  const candidateAbortController = useRef<AbortController | null>(null);
  const candidateRequestGuard = useRef(new LatestRequestGuard());
  const [form, setForm] = useState({
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

  const loadCustomers = useCallback(async (cursor?: string) => {
    customerListAbortController.current?.abort();
    const controller = new AbortController();
    customerListAbortController.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const url = new URL(listUrl, window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(`${url.pathname}${url.search}`, { cache: "no-store", signal: controller.signal });
      const data = (await response.json().catch(() => ({}))) as CustomerListResponse;

      if (response.ok) {
        setCustomers((current) => (cursor ? [...current, ...(data.customers || [])] : data.customers || []));
        setPendingAftercare(data.pendingAftercare || []);
        if (!cursor) setSummary(data.summary || emptySummary);
        setNextCursor(data.nextCursor || null);
      } else {
        setError(mapWebResponseError(response.status, "고객 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      }
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError("고객 목록 네트워크 요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [listUrl]);

  const loadInvite = useCallback(async () => {
    setIsInviteLoading(true);
    const response = await fetch("/api/salon/matching/invite", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as MatchInviteResponse;

    if (response.ok) {
      setInvite(data.invite || null);
    } else {
      setError(mapWebResponseError(response.status, "초대 링크를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    }

    setIsInviteLoading(false);
  }, []);

  async function createInvite(confirmReplace = false) {
    if (isAdminReadOnly) {
      return;
    }

    setIsInviteLoading(true);
    setError(null);

    const response = await fetch("/api/salon/matching/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmReplace,
        expectedActiveInviteId: confirmReplace ? invite?.id || null : null,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as MatchInviteResponse;

    if (response.ok) {
      setInvite(data.invite || null);
      setCopyState("idle");
      setReissueConfirmOpen(false);
    } else {
      setError(mapWebResponseError(response.status, "초대 링크를 만들지 못했습니다. 잠시 후 다시 시도해 주세요."));
    }

    setIsInviteLoading(false);
  }

  async function copyInviteUrl() {
    if (!invite?.inviteUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
    }
  }

  const loadCandidates = useCallback(async (cursor: string | null = null) => {
    candidateAbortController.current?.abort();
    const controller = new AbortController();
    candidateAbortController.current = controller;
    const requestToken = candidateRequestGuard.current.begin();
    setIsCandidateLoading(true);
    setCandidateError(null);

    const params = new URLSearchParams({ status: "pending", limit: "20" });
    if (matchQuery.trim()) {
      params.set("q", matchQuery.trim());
    }
    if (cursor) {
      params.set("cursor", cursor);
    }

    try {
      const response = await fetch(`/api/salon/matches?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as MatchCandidateResponse;

      if (!candidateRequestGuard.current.isCurrent(requestToken)) {
        return false;
      }
      if (!response.ok) {
        setCandidateError("매칭 후보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }

      setCandidates(data.candidates || []);
      setCandidateNextCursor(data.nextCursor || null);
      return true;
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return false;
      }
      if (candidateRequestGuard.current.isCurrent(requestToken)) {
        setCandidateError("매칭 후보 네트워크 요청에 실패했습니다. 연결 상태를 확인해 주세요.");
      }
      return false;
    } finally {
      if (candidateRequestGuard.current.isCurrent(requestToken) && !controller.signal.aborted) {
        setIsCandidateLoading(false);
      }
    }
  }, [matchQuery]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCustomers();
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      customerListAbortController.current?.abort();
    };
  }, [loadCustomers]);

  useEffect(() => {
    if (!isRoleLoaded) {
      return;
    }

    if (isAdminReadOnly) {
      const timeout = window.setTimeout(() => {
        setInvite(null);
        setIsInviteLoading(false);
      }, 0);

      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => {
      void loadInvite();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [isAdminReadOnly, isRoleLoaded, loadInvite]);

  useEffect(() => {
    const requestGuard = candidateRequestGuard.current;
    if (!isRoleLoaded) {
      return;
    }

    if (isAdminReadOnly) {
      const timeout = window.setTimeout(() => {
        candidateAbortController.current?.abort();
        candidateRequestGuard.current.invalidate();
        setCandidates([]);
        setCandidateError(null);
        setCandidateCurrentCursor(null);
        setCandidateNextCursor(null);
        setCandidateCursorHistory([]);
        setIsCandidateLoading(false);
      }, 0);

      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => {
      setCandidateCurrentCursor(null);
      setCandidateNextCursor(null);
      setCandidateCursorHistory([]);
      void loadCandidates(null);
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      candidateAbortController.current?.abort();
      requestGuard.invalidate();
    };
  }, [isAdminReadOnly, isRoleLoaded, loadCandidates]);

  async function handleSubmit() {
    if (isSubmitting || isAdminReadOnly) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/salon/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        source: "manual",
        nextFollowUpAt: form.nextFollowUpAt || null,
      }),
    });
    if (response.ok) {
      setForm({
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
      setError(mapWebResponseError(response.status, "고객을 등록하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요."));
    }

    setIsSubmitting(false);
  }

  async function linkCandidate(candidate: SalonMatchCandidate) {
    if (linkingRequestId || isAdminReadOnly) {
      return;
    }

    setLinkingRequestId(candidate.id);
    setCandidateError(null);

    try {
      const response = await fetch(`/api/salon/matches/${candidate.id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        await Promise.all([loadCustomers(), loadCandidates(candidateCurrentCursor)]);
      } else {
        setCandidateError("회원 연결 상태가 변경되었거나 요청을 처리하지 못했습니다. 후보를 새로고침해 주세요.");
      }
    } catch {
      setCandidateError("회원 연결 요청에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setLinkingRequestId(null);
    }
  }

  async function showNextCandidatePage() {
    if (!candidateNextCursor || isCandidateLoading) {
      return;
    }

    const next = candidateNextCursor;
    const loaded = await loadCandidates(next);
    if (loaded) {
      setCandidateCursorHistory((current) => [...current, candidateCurrentCursor]);
      setCandidateCurrentCursor(next);
    }
  }

  async function showPreviousCandidatePage() {
    if (candidateCursorHistory.length === 0 || isCandidateLoading) {
      return;
    }

    const previous = candidateCursorHistory.at(-1) || null;
    const loaded = await loadCandidates(previous);
    if (loaded) {
      setCandidateCursorHistory((current) => current.slice(0, -1));
      setCandidateCurrentCursor(previous);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-stone-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-600">살롱 고객 관리</p>
          <h1 className="mt-2 text-2xl font-black tracking-normal text-stone-950">고객관리</h1>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-stone-500">
            살롱 계정은 초대·회원 연결·고객 등록을 변경할 수 있습니다. 관리자 대리 조회에서는 모든 변경 기능이 잠깁니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:min-w-[560px] lg:grid-cols-4">
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

      {isAdminReadOnly ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          관리자 대리 조회 모드입니다. 현재 화면은 조회 전용이며, 변경하려면 관리자 회원 목록에서 대상 계정을 다시 선택해 주세요.
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 border-b border-stone-200 pb-4 md:flex-row md:items-center">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="고객 이름, 전화번호 또는 이메일 검색"
                placeholder="이름, 전화번호, 이메일 검색"
                className="h-10 w-full rounded-md border border-stone-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-stone-950"
              />
            </label>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as "all" | SalonCustomerSource)}
              aria-label="고객 유입 경로 필터"
              className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-stone-950"
            >
              <option value="all">전체 유입</option>
              <option value="manual">수기 등록</option>
              <option value="linked_member">회원 연결</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-md border border-stone-200 bg-white">
            <div className="hidden grid-cols-[1.2fr_0.9fr_0.8fr_0.8fr_88px] border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs font-bold text-stone-500 md:grid">
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
                className="mx-3 my-3 grid grid-cols-1 gap-3 rounded-md border border-stone-200 bg-white px-4 py-4 text-sm md:m-0 md:grid-cols-[1.2fr_0.9fr_0.8fr_0.8fr_88px] md:items-center md:rounded-none md:border-0 md:border-b md:border-stone-100 md:last:border-b-0"
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
                  <p className="mb-1 text-[11px] font-black uppercase tracking-[0.12em] text-stone-600 md:hidden">연락처</p>
                  <p className="truncate">{customer.phone || "-"}</p>
                  <p className="truncate text-xs text-stone-600">{customer.email || "-"}</p>
                </div>
                <div className="flex items-center justify-between gap-3 text-stone-600 md:block">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-stone-600 md:hidden">최근 방문</p>
                  <span>{formatDate(customer.lastVisitAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-stone-600 md:justify-start md:gap-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-stone-600 md:hidden">사후관리</p>
                  <span className="inline-flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-stone-400" />
                    {formatDate(customer.nextFollowUpAt)}
                  </span>
                </div>
                <Link
                  href={`/salon/customers/${customer.id}`}
                  className="rounded-md border border-stone-300 px-3 py-2 text-center text-xs font-semibold text-stone-800 hover:bg-stone-50 md:text-right"
                >
                  열기
                </Link>
              </div>
            ))}
            {nextCursor ? (
              <div className="border-t border-stone-200 p-4 text-center">
                <p className="mb-3 text-xs text-stone-500">
                  현재 {customers.length.toLocaleString("ko-KR")} / 총 {summary.totalCustomers.toLocaleString("ko-KR")}명
                </p>
                <Button type="button" variant="secondary" disabled={isLoading} onClick={() => void loadCustomers(nextCursor)}>
                  {isLoading ? "불러오는 중..." : "고객 더 보기"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="grid gap-4 md:grid-cols-2 xl:sticky xl:top-24 xl:block xl:self-start xl:space-y-6">
          <section className="rounded-md border border-stone-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-stone-500" />
                <h2 className="text-sm font-bold text-stone-950">회원 매칭 초대</h2>
              </div>
              <button
                type="button"
                onClick={() => void loadInvite()}
                disabled={isInviteLoading}
                aria-label="회원 매칭 초대 새로고침"
                className="rounded-md border border-stone-300 p-2 text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                title="새로고침"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              {invite?.inviteUrl ? (
                <>
                  <input
                    value={invite.inviteUrl}
                    readOnly
                    aria-label="회원 매칭 초대 링크"
                    className="h-10 rounded-md border border-stone-300 bg-stone-50 px-3 text-sm text-stone-700 outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="secondary" onClick={() => void copyInviteUrl()}>
                      <Copy className="mr-2 h-4 w-4" />
                      {copyState === "copied" ? "복사됨" : copyState === "failed" ? "복사 실패" : "복사"}
                    </Button>
                    <Button type="button" onClick={() => setReissueConfirmOpen(true)} disabled={isInviteLoading || isAdminReadOnly}>
                      재발급
                    </Button>
                  </div>
                  <p className="text-xs leading-5 text-stone-500">
                    링크를 받은 회원이 수락하면 아래 매칭 후보에 표시됩니다.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm leading-6 text-stone-500">
                    회원이 동의한 뒤에만 CRM 후보로 보이도록 초대 링크를 발급합니다.
                  </p>
                  <Button type="button" onClick={() => void createInvite(false)} disabled={isInviteLoading || isAdminReadOnly}>
                    {isInviteLoading ? "확인 중..." : "초대 링크 만들기"}
                  </Button>
                </>
              )}
            </div>
          </section>

          <section
            className="rounded-md border border-stone-200 bg-white p-4"
            aria-busy={isCandidateLoading}
          >
            <div className="flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-stone-500" />
              <h2 className="text-sm font-bold text-stone-950">매칭 후보</h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              현재 공유에 동의한 회원만 표시됩니다. 연결하면 CRM 고객으로 추가되고 고객 상세에서 연결을 해제할 수 있습니다.
            </p>

            <label className="relative mt-4 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                value={matchQuery}
                onChange={(event) => setMatchQuery(event.target.value)}
                aria-label="매칭 후보 회원 이름 또는 이메일 검색"
                placeholder="회원 이름, 이메일 검색"
                className="h-10 w-full rounded-md border border-stone-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-stone-950"
              />
            </label>

            <div className="mt-4 grid gap-2" aria-live="polite">
              {candidateError ? (
                <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3">
                  <p className="text-xs leading-5 text-rose-700">{candidateError}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-2 w-full"
                    disabled={isCandidateLoading}
                    onClick={() => void loadCandidates(candidateCurrentCursor)}
                  >
                    후보 다시 불러오기
                  </Button>
                </div>
              ) : null}
              {isCandidateLoading && candidates.length === 0 ? (
                <p className="rounded-md border border-stone-200 px-3 py-4 text-center text-sm text-stone-500">
                  후보 확인 중...
                </p>
              ) : null}
              {isCandidateLoading && candidates.length > 0 ? (
                <p className="text-center text-xs text-stone-500">새 후보 페이지를 불러오는 중...</p>
              ) : null}
              {!isCandidateLoading && candidates.length === 0 ? (
                <p className="rounded-md border border-dashed border-stone-200 px-3 py-4 text-center text-sm text-stone-500">
                  대기 중인 매칭 후보가 없습니다.
                </p>
              ) : null}
              {candidates.map((candidate) => (
                <div key={candidate.id} className="rounded-md border border-stone-200 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-950">{candidate.member.displayName}</p>
                    <p className="mt-1 truncate text-xs text-stone-500">{candidate.member.email || "-"}</p>
                    <p className="mt-1 text-[11px] font-semibold text-emerald-700">공유 동의 완료 · CRM 연결 대기</p>
                  </div>
                  <Button
                    type="button"
                    className="mt-3 w-full"
                    disabled={linkingRequestId === candidate.id || isAdminReadOnly}
                    onClick={() => void linkCandidate(candidate)}
                  >
                    {linkingRequestId === candidate.id ? "연결 중..." : "CRM 고객으로 연결"}
                  </Button>
                </div>
              ))}
              {candidates.length > 0 || candidateCursorHistory.length > 0 ? (
                <div className="mt-1 border-t border-stone-200 pt-3">
                  <p className="mb-2 text-center text-xs text-stone-500">
                    {candidateCursorHistory.length + 1}페이지 · 현재 {candidates.length}명
                    {candidateNextCursor ? " · 다음 후보 있음" : " · 마지막 페이지"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={candidateCursorHistory.length === 0 || isCandidateLoading}
                      onClick={() => void showPreviousCandidatePage()}
                    >
                      이전
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!candidateNextCursor || isCandidateLoading}
                      onClick={() => void showNextCandidatePage()}
                    >
                      다음
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-md border border-stone-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-stone-500" />
              <h2 id="salon-customer-create-title" className="text-sm font-bold text-stone-950">고객 등록</h2>
            </div>

            <fieldset
              disabled={isAdminReadOnly}
              aria-labelledby="salon-customer-create-title"
              className="mt-4 grid gap-3 disabled:opacity-75"
            >
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                aria-label="고객 이름"
                placeholder="고객 이름"
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                aria-label="고객 전화번호"
                placeholder="전화번호"
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <input
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                aria-label="고객 이메일"
                placeholder="이메일"
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <input
                type="datetime-local"
                value={form.nextFollowUpAt}
                onChange={(event) => setForm((current) => ({ ...current, nextFollowUpAt: event.target.value }))}
                aria-label="다음 관리 예정일"
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <textarea
                value={form.memo}
                onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
                aria-label="고객 메모"
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
              <Button type="button" onClick={handleSubmit} disabled={isSubmitting || isAdminReadOnly}>
                {isSubmitting ? "등록 중..." : "고객 등록"}
              </Button>
            </fieldset>
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
      <ConfirmActionDialog
        open={reissueConfirmOpen}
        onOpenChange={setReissueConfirmOpen}
        onConfirm={() => void createInvite(true)}
        title="초대 링크를 재발급할까요?"
        description="현재 링크는 즉시 무효화되고 새 링크만 사용할 수 있습니다. 이미 수락된 회원 연결은 유지됩니다."
        confirmLabel="새 링크 발급"
        pendingLabel="발급 중…"
        isPending={isInviteLoading}
        tone="danger"
        target={invite?.inviteUrl}
        afterValue="새 링크만 유효"
      />
    </div>
  );
}
