"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clock3, LinkIcon, MessageSquarePlus, ScissorsLineDashed, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { useAdminReadOnly } from "../../hooks/useAdminReadOnly";
import type {
  SalonAftercareChannel,
  SalonAftercareTask,
  SalonCustomer,
  SalonLinkedMember,
  SalonMemberGenerationSummary,
  SalonVisit,
} from "../../lib/salon-crm-types";

interface DetailResponse {
  customer?: SalonCustomer;
  visits?: SalonVisit[];
  aftercareTasks?: SalonAftercareTask[];
  linkedMember?: SalonLinkedMember | null;
  linkedMemberGenerations?: SalonMemberGenerationSummary[];
  error?: string;
}

function formatDateTime(value: string | null) {
  if (!value) {
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

function toLocalInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function CustomerDetailClient({ customerId }: { customerId: string }) {
  const { isAdminReadOnly } = useAdminReadOnly();
  const [customer, setCustomer] = useState<SalonCustomer | null>(null);
  const [visits, setVisits] = useState<SalonVisit[]>([]);
  const [aftercareTasks, setAftercareTasks] = useState<SalonAftercareTask[]>([]);
  const [linkedMember, setLinkedMember] = useState<SalonLinkedMember | null>(null);
  const [linkedMemberGenerations, setLinkedMemberGenerations] = useState<SalonMemberGenerationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    name: "",
    phone: "",
    email: "",
    memo: "",
    consentSms: false,
    consentKakao: false,
    nextFollowUpAt: "",
  });
  const [visitForm, setVisitForm] = useState({
    visitedAt: toLocalInputValue(new Date().toISOString()),
    serviceNote: "",
    memo: "",
    nextRecommendedVisitAt: "",
    createAftercare: true,
  });
  const [aftercareForm, setAftercareForm] = useState({
    channel: "manual" as SalonAftercareChannel,
    scheduledFor: "",
    templateKey: "",
    note: "",
  });

  const pendingTasks = useMemo(
    () => aftercareTasks.filter((task) => task.status === "pending").sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)),
    [aftercareTasks],
  );

  async function loadDetails() {
    setIsLoading(true);
    setError(null);

    const response = await fetch(`/api/salon/customers/${customerId}`, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as DetailResponse;

    if (response.ok && data.customer) {
      setCustomer(data.customer);
      setVisits(data.visits || []);
      setAftercareTasks(data.aftercareTasks || []);
      setLinkedMember(data.linkedMember || null);
      setLinkedMemberGenerations(data.linkedMemberGenerations || []);
      setProfileForm({
        name: data.customer.name,
        phone: data.customer.phone,
        email: data.customer.email,
        memo: data.customer.memo,
        consentSms: data.customer.consentSms,
        consentKakao: data.customer.consentKakao,
        nextFollowUpAt: toLocalInputValue(data.customer.nextFollowUpAt),
      });
    } else {
      setError(data.error || "고객 정보를 불러오지 못했습니다.");
    }

    setIsLoading(false);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadDetails();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [customerId]);

  async function saveProfile() {
    if (isAdminReadOnly) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const response = await fetch(`/api/salon/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileForm),
    });
    const data = (await response.json().catch(() => ({}))) as DetailResponse;

    if (response.ok && data.customer) {
      setCustomer(data.customer);
    } else {
      setError(data.error || "고객 정보를 저장하지 못했습니다.");
    }

    setIsSaving(false);
  }

  async function addVisit() {
    if (isAdminReadOnly) {
      return;
    }

    if (!visitForm.serviceNote.trim()) {
      setError("방문 기록 내용을 입력해 주세요.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const response = await fetch(`/api/salon/customers/${customerId}/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(visitForm),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    if (response.ok) {
      setVisitForm({
        visitedAt: toLocalInputValue(new Date().toISOString()),
        serviceNote: "",
        memo: "",
        nextRecommendedVisitAt: "",
        createAftercare: true,
      });
      await loadDetails();
    } else {
      setError(data.error || "방문 기록을 추가하지 못했습니다.");
    }

    setIsSaving(false);
  }

  async function addAftercare() {
    if (isAdminReadOnly) {
      return;
    }

    if (!aftercareForm.scheduledFor) {
      setError("사후관리 예정일을 입력해 주세요.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const response = await fetch(`/api/salon/customers/${customerId}/aftercare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aftercareForm),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    if (response.ok) {
      setAftercareForm({ channel: "manual", scheduledFor: "", templateKey: "", note: "" });
      await loadDetails();
    } else {
      setError(data.error || "사후관리 항목을 추가하지 못했습니다.");
    }

    setIsSaving(false);
  }

  async function completeTask(taskId: string) {
    if (isAdminReadOnly) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const response = await fetch(`/api/salon/aftercare/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    if (response.ok) {
      await loadDetails();
    } else {
      setError(data.error || "사후관리 상태를 변경하지 못했습니다.");
    }

    setIsSaving(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-stone-200 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/salon/customers" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-stone-950">
            <ArrowLeft className="h-4 w-4" />
            고객 목록
          </Link>
          <h1 className="mt-3 text-2xl font-black tracking-normal text-stone-950">
            {customer?.name || (isLoading ? "불러오는 중..." : "고객 상세")}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {customer?.isLinkedMember ? "HairFit 회원 연결 고객" : "수기 등록 고객"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:min-w-[420px] md:grid-cols-3">
          <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
            <p className="text-xs text-stone-500">방문 기록</p>
            <p className="text-xl font-bold text-stone-950">{visits.length}</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
            <p className="text-xs text-stone-500">대기 사후관리</p>
            <p className="text-xl font-bold text-stone-950">{pendingTasks.length}</p>
          </div>
          <div className="col-span-2 rounded-md border border-stone-200 bg-white px-3 py-2 md:col-span-1">
            <p className="text-xs text-stone-500">다음 연락</p>
            <p className="text-sm font-bold text-stone-950">{formatDateTime(customer?.nextFollowUpAt || null)}</p>
          </div>
        </div>
      </header>

      {isAdminReadOnly ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Admin read-only mode: select this salon in Admin to make changes.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
        <aside className="space-y-4">
          <section className="rounded-md border border-stone-200 bg-white p-4">
            <h2 className="text-sm font-bold text-stone-950">고객 정보</h2>
            <fieldset disabled={isAdminReadOnly} className="mt-4 grid gap-3 disabled:opacity-75">
              <input
                value={profileForm.name}
                onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <input
                value={profileForm.phone}
                onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="전화번호"
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <input
                value={profileForm.email}
                onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="이메일"
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <input
                type="datetime-local"
                value={profileForm.nextFollowUpAt}
                onChange={(event) => setProfileForm((current) => ({ ...current, nextFollowUpAt: event.target.value }))}
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <textarea
                value={profileForm.memo}
                onChange={(event) => setProfileForm((current) => ({ ...current, memo: event.target.value }))}
                rows={5}
                placeholder="상담 메모"
                className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-950"
              />
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={profileForm.consentSms}
                  onChange={(event) => setProfileForm((current) => ({ ...current, consentSms: event.target.checked }))}
                />
                문자 수신 동의
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={profileForm.consentKakao}
                  onChange={(event) => setProfileForm((current) => ({ ...current, consentKakao: event.target.checked }))}
                />
                카카오 알림 동의
              </label>
              <Button type="button" onClick={saveProfile} disabled={isSaving || isLoading || isAdminReadOnly}>
                저장
              </Button>
            </fieldset>
          </section>

          {linkedMember ? (
            <section className="rounded-md border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-stone-950">연결 회원</h2>
              </div>
              <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-3">
                <p className="truncate text-sm font-semibold text-emerald-950">{linkedMember.displayName}</p>
                <p className="mt-1 truncate text-xs text-emerald-700">{linkedMember.email || "-"}</p>
              </div>
            </section>
          ) : null}
        </aside>

        <main className="space-y-4">
          <section className="rounded-md border border-stone-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <ScissorsLineDashed className="h-4 w-4 text-stone-500" />
              <h2 className="text-sm font-bold text-stone-950">방문 기록 추가</h2>
            </div>
            <fieldset disabled={isAdminReadOnly} className="mt-4 grid gap-3 md:grid-cols-2 disabled:opacity-75">
              <input
                type="datetime-local"
                value={visitForm.visitedAt}
                onChange={(event) => setVisitForm((current) => ({ ...current, visitedAt: event.target.value }))}
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <input
                type="datetime-local"
                value={visitForm.nextRecommendedVisitAt}
                onChange={(event) =>
                  setVisitForm((current) => ({ ...current, nextRecommendedVisitAt: event.target.value }))
                }
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <textarea
                value={visitForm.serviceNote}
                onChange={(event) => setVisitForm((current) => ({ ...current, serviceNote: event.target.value }))}
                rows={4}
                placeholder="시술/상담 내용"
                className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-950 md:col-span-2"
              />
              <textarea
                value={visitForm.memo}
                onChange={(event) => setVisitForm((current) => ({ ...current, memo: event.target.value }))}
                rows={3}
                placeholder="내부 메모"
                className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-950 md:col-span-2"
              />
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={visitForm.createAftercare}
                  onChange={(event) => setVisitForm((current) => ({ ...current, createAftercare: event.target.checked }))}
                />
                다음 추천일로 사후관리 생성
              </label>
              <div className="md:text-right">
                <Button type="button" onClick={addVisit} disabled={isSaving || isAdminReadOnly}>
                  방문 기록 추가
                </Button>
              </div>
            </fieldset>
          </section>

          {linkedMember ? (
            <section className="rounded-md border border-stone-200 bg-white">
              <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
                <Sparkles className="h-4 w-4 text-stone-500" />
                <h2 className="text-sm font-bold text-stone-950">최근 HairFit 생성 결과</h2>
              </div>
              <div className="divide-y divide-stone-100">
                {linkedMemberGenerations.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-stone-500">
                    연결 회원의 생성 결과가 아직 없습니다.
                  </p>
                ) : null}
                {linkedMemberGenerations.map((item) => (
                  <article key={item.id} className="px-4 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-stone-500">{formatDateTime(item.createdAt)}</p>
                        <p className="mt-2 truncate text-sm font-semibold text-stone-950">
                          {item.styleLabel || item.promptUsed || "헤어 생성 결과"}
                        </p>
                        <p className="mt-1 truncate text-xs text-stone-500">{item.id}</p>
                      </div>
                      <span className="self-start rounded-md bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">
                        {item.status}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-md border border-stone-200 bg-white">
            <div className="border-b border-stone-200 px-4 py-3">
              <h2 className="text-sm font-bold text-stone-950">방문 타임라인</h2>
            </div>
            <div className="divide-y divide-stone-100">
              {visits.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-stone-500">방문 기록이 없습니다.</p>
              ) : null}
              {visits.map((visit) => (
                <article key={visit.id} className="px-4 py-4">
                  <p className="text-xs font-semibold text-stone-500">{formatDateTime(visit.visitedAt)}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-stone-950">{visit.serviceNote}</p>
                  {visit.memo ? <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">{visit.memo}</p> : null}
                  {visit.nextRecommendedVisitAt ? (
                    <p className="mt-2 text-xs text-stone-500">다음 추천: {formatDateTime(visit.nextRecommendedVisitAt)}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </main>

        <aside className="space-y-4">
          <section className="rounded-md border border-stone-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-stone-500" />
              <h2 className="text-sm font-bold text-stone-950">사후관리 추가</h2>
            </div>
            <fieldset disabled={isAdminReadOnly} className="mt-4 grid gap-3 disabled:opacity-75">
              <select
                value={aftercareForm.channel}
                onChange={(event) =>
                  setAftercareForm((current) => ({ ...current, channel: event.target.value as SalonAftercareChannel }))
                }
                className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-stone-950"
              >
                <option value="manual">직접 처리</option>
                <option value="sms">문자 준비</option>
                <option value="kakao">카카오 준비</option>
                <option value="phone">전화</option>
              </select>
              <input
                type="datetime-local"
                value={aftercareForm.scheduledFor}
                onChange={(event) => setAftercareForm((current) => ({ ...current, scheduledFor: event.target.value }))}
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <input
                value={aftercareForm.templateKey}
                onChange={(event) => setAftercareForm((current) => ({ ...current, templateKey: event.target.value }))}
                placeholder="템플릿 키"
                className="h-10 rounded-md border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              />
              <textarea
                value={aftercareForm.note}
                onChange={(event) => setAftercareForm((current) => ({ ...current, note: event.target.value }))}
                rows={4}
                placeholder="사후관리 메모"
                className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-950"
              />
              <Button type="button" onClick={addAftercare} disabled={isSaving || isAdminReadOnly}>
                사후관리 추가
              </Button>
            </fieldset>
          </section>

          <section className="rounded-md border border-stone-200 bg-white">
            <div className="border-b border-stone-200 px-4 py-3">
              <h2 className="text-sm font-bold text-stone-950">사후관리</h2>
            </div>
            <div className="divide-y divide-stone-100">
              {aftercareTasks.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-stone-500">사후관리 항목이 없습니다.</p>
              ) : null}
              {aftercareTasks.map((task) => (
                <article key={task.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold text-stone-950">
                        <Clock3 className="h-4 w-4 text-stone-400" />
                        {formatDateTime(task.scheduledFor)}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">{task.channel} · {task.status}</p>
                    </div>
                    {task.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => void completeTask(task.id)}
                        disabled={isSaving || isAdminReadOnly}
                        className="rounded-md border border-stone-300 p-2 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                        title="완료"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  {task.note ? <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">{task.note}</p> : null}
                  {task.templateKey ? <p className="mt-2 text-xs text-stone-400">템플릿: {task.templateKey}</p> : null}
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
