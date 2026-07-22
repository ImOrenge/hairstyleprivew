"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmActionDialog } from "../../../components/ui/ConfirmActionDialog";
import { Button } from "../../../components/ui/Button";
import type { AdminActionOutcome, AdminActionReceipt } from "../../../lib/admin-action-receipt";
import { mapWebResponseError } from "../../../lib/web-user-message";

type AccountType = "member" | "salon_owner" | "admin" | null;

interface MemberRow {
  id: string;
  email: string | null;
  display_name: string | null;
  account_type: AccountType;
  credits: number | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MemberResponse {
  members?: MemberRow[];
  total?: number;
  nextCursor?: string | null;
  error?: string;
}

interface CreditDraft {
  delta: string;
  reason: string;
}

type PendingMemberAction =
  | {
      type: "role";
      actionKey: string;
      member: MemberRow;
      expectedAccountType: Exclude<AccountType, null>;
      accountType: Exclude<AccountType, null>;
    }
  | {
      type: "credit";
      actionKey: string;
      member: MemberRow;
      delta: number;
      reason: string;
    };

interface AdminMutationResponse {
  outcome?: AdminActionOutcome;
  receipt?: AdminActionReceipt;
  error?: string;
  message?: string;
}

interface ActionNotice {
  outcome: AdminActionOutcome;
  receipt: AdminActionReceipt;
  message: string;
}

const confirmationLabels = {
  role: "권한 변경",
  credit: "크레딧 조정",
} as const;

const accountTypeFilters = [
  { value: "all", label: "전체" },
  { value: "member", label: "고객" },
  { value: "salon_owner", label: "살롱 운영자" },
  { value: "admin", label: "관리자" },
  { value: "unset", label: "미설정" },
] as const;

function accountTypeLabel(value: AccountType) {
  if (value === "admin") return "관리자";
  if (value === "salon_owner") return "살롱 운영자";
  if (value === "member") return "고객";
  return "미설정";
}

function formatDate(value: string | null) {
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

function outcomeLabel(outcome: AdminActionOutcome) {
  if (outcome === "succeeded") return "완료";
  if (outcome === "already_processed") return "이미 처리됨";
  if (outcome === "provider_pending") return "외부 동기화 대기";
  if (outcome === "processing") return "처리 중";
  if (outcome === "conflict") return "최신 상태 충돌";
  return "실패";
}

function noticeTone(outcome: AdminActionOutcome) {
  if (outcome === "conflict" || outcome === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  if (outcome === "processing" || outcome === "provider_pending") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

export default function AdminMembersPage() {
  const [query, setQuery] = useState("");
  const [accountType, setAccountType] = useState<(typeof accountTypeFilters)[number]["value"]>("all");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Exclude<AccountType, null>>>({});
  const [creditDrafts, setCreditDrafts] = useState<Record<string, CreditDraft>>({});
  const [pendingAction, setPendingAction] = useState<PendingMemberAction | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const [roleRetry, setRoleRetry] = useState<Extract<PendingMemberAction, { type: "role" }> | null>(null);
  const listAbortController = useRef<AbortController | null>(null);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (accountType !== "all") {
      params.set("accountType", accountType);
    }
    params.set("limit", "100");
    return `/api/admin/members?${params.toString()}`;
  }, [query, accountType]);

  const loadMembers = useCallback(async (cursor?: string) => {
    listAbortController.current?.abort();
    const controller = new AbortController();
    listAbortController.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const url = new URL(listUrl, window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(`${url.pathname}${url.search}`, { cache: "no-store", signal: controller.signal });
      const data = (await response.json().catch(() => ({}))) as MemberResponse;

      if (!response.ok) {
        setError(mapWebResponseError(response.status, "회원 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
        return;
      }

      const nextMembers = data.members || [];
      setMembers((current) => (cursor ? [...current, ...nextMembers] : nextMembers));
      if (!cursor) setTotal(data.total || nextMembers.length);
      setNextCursor(data.nextCursor || null);
      setRoleDrafts((current) => {
        const merged = { ...current };
        for (const member of nextMembers) {
          merged[member.id] = (member.account_type || "member") as Exclude<AccountType, null>;
        }
        return merged;
      });
      setCreditDrafts((current) => {
        const merged = { ...current };
        for (const member of nextMembers) {
          if (!merged[member.id]) merged[member.id] = { delta: "", reason: "" };
        }
        return merged;
      });
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError("회원 목록 네트워크 요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMembers();
    }, 180);

    return () => {
      window.clearTimeout(timer);
      listAbortController.current?.abort();
    };
  }, [loadMembers]);

  function openRoleConfirmation(member: MemberRow) {
    const role = roleDrafts[member.id];
    const currentRole = member.account_type || "member";
    if (!role || role === currentRole) {
      setError("변경할 권한을 현재 권한과 다르게 선택해 주세요.");
      return;
    }

    setError(null);
    setConfirmationText("");
    setPendingAction({
      type: "role",
      actionKey: crypto.randomUUID(),
      member,
      expectedAccountType: currentRole,
      accountType: role,
    });
  }

  function openCreditConfirmation(member: MemberRow) {
    const draft = creditDrafts[member.id];
    if (!draft) {
      return;
    }

    const delta = Number(draft.delta);
    if (!Number.isInteger(delta) || delta === 0) {
      setError("크레딧 증감값은 0이 아닌 정수여야 합니다.");
      return;
    }
    if (!draft.reason.trim()) {
      setError("크레딧 조정 사유를 입력해주세요.");
      return;
    }

    const currentBalance = member.credits || 0;
    if (currentBalance + delta < 0) {
      setError("조정 후 크레딧 잔액은 음수가 될 수 없습니다.");
      return;
    }

    setError(null);
    setConfirmationText("");
    setPendingAction({
      type: "credit",
      actionKey: crypto.randomUUID(),
      member,
      delta,
      reason: draft.reason.trim(),
    });
  }

  async function executePendingAction() {
    if (!pendingAction) return;

    const userId = pendingAction.member.id;
    const busy = `${pendingAction.type}-${userId}`;
    setBusyKey(busy);
    setError(null);

    const isRoleChange = pendingAction.type === "role";
    const response = await fetch(
      isRoleChange
        ? `/api/admin/members/${encodeURIComponent(userId)}/account-type`
        : `/api/admin/members/${encodeURIComponent(userId)}/credits`,
      {
        method: isRoleChange ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRoleChange
            ? {
                actionKey: pendingAction.actionKey,
                expectedAccountType: pendingAction.expectedAccountType,
                accountType: pendingAction.accountType,
              }
            : {
                actionKey: pendingAction.actionKey,
                expectedBalance: pendingAction.member.credits || 0,
                delta: pendingAction.delta,
                reason: pendingAction.reason,
              },
        ),
      },
    );
    const data = (await response.json().catch(() => ({}))) as AdminMutationResponse;

    if (data.outcome && data.receipt) {
      setActionNotice({
        outcome: data.outcome,
        receipt: data.receipt,
        message:
          data.outcome === "provider_pending"
            ? "DB 변경은 완료되었고 외부 권한 동기화를 기다리고 있습니다."
            : "관리자 작업 상태를 감사 영수증에 기록했습니다.",
      });
    }

    if (!response.ok || !data.outcome || !data.receipt) {
      setError(
        mapWebResponseError(
          response.status,
          isRoleChange
            ? "계정 유형 변경에 실패했습니다. 작업 영수증을 확인한 뒤 다시 시도해 주세요."
            : "크레딧 조정에 실패했습니다. 작업 영수증을 확인한 뒤 다시 시도해 주세요.",
        ),
      );
    } else {
      if (pendingAction.type === "role") {
        setRoleRetry(data.outcome === "provider_pending" ? pendingAction : null);
      }

      if (!isRoleChange) {
        setCreditDrafts((current) => ({
          ...current,
          [userId]: { delta: "", reason: "" },
        }));
      }
    }

    setPendingAction(null);
    setConfirmationText("");
    setBusyKey(null);
    await loadMembers();
  }

  const requiredConfirmation = pendingAction ? confirmationLabels[pendingAction.type] : "";
  const pendingBefore = pendingAction
    ? pendingAction.type === "role"
      ? accountTypeLabel(pendingAction.member.account_type || "member")
      : `${pendingAction.member.credits || 0} 크레딧`
    : null;
  const pendingAfter = pendingAction
    ? pendingAction.type === "role"
      ? accountTypeLabel(pendingAction.accountType)
      : `${(pendingAction.member.credits || 0) + pendingAction.delta} 크레딧 (${pendingAction.delta > 0 ? "+" : ""}${pendingAction.delta})`
    : null;

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">관리자 대시보드</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">회원관리</h1>
        <p className="mt-2 text-sm text-stone-600">총 {total}명</p>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          이 화면은 조회와 변경이 모두 가능합니다. 권한·크레딧 변경은 확인 절차 후 즉시 적용되고 감사 영수증이 기록됩니다.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="user id / email / 이름 검색"
            className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
          />
          <select
            value={accountType}
            onChange={(event) =>
              setAccountType(event.target.value as (typeof accountTypeFilters)[number]["value"])
            }
            className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-900"
          >
            {accountTypeFilters.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {actionNotice ? (
        <div
          aria-live={actionNotice.outcome === "failed" || actionNotice.outcome === "conflict" ? "assertive" : "polite"}
          className={`rounded-xl border px-4 py-3 text-sm ${noticeTone(actionNotice.outcome)}`}
          role={actionNotice.outcome === "failed" || actionNotice.outcome === "conflict" ? "alert" : "status"}
        >
          <p className="font-black">{outcomeLabel(actionNotice.outcome)}</p>
          <p className="mt-1">{actionNotice.message}</p>
          <p className="mt-1 break-all text-xs opacity-80">
            감사 영수증 {actionNotice.receipt.id} · 처리 시각 {formatDate(actionNotice.receipt.completed_at || actionNotice.receipt.updated_at)}
          </p>
          {roleRetry ? (
            <Button
              type="button"
              variant="secondary"
              className="mt-3 h-9 rounded-lg px-3 text-xs"
              onClick={() => {
                setConfirmationText("");
                setPendingAction(roleRetry);
              }}
            >
              Clerk 권한 동기화 재시도
            </Button>
          ) : null}
        </div>
      ) : null}

      <section className="rounded-2xl border border-stone-200 bg-white">
        <div className="hidden grid-cols-[1.1fr_1fr_0.8fr_1.6fr] gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs font-bold text-stone-500 md:grid">
          <span>회원</span>
          <span>권한</span>
          <span>크레딧</span>
          <span>액션</span>
        </div>

        {isLoading ? <p className="px-4 py-8 text-sm text-stone-500">불러오는 중...</p> : null}
        {!isLoading && members.length === 0 ? (
          <p className="px-4 py-8 text-sm text-stone-500">조회된 회원이 없습니다.</p>
        ) : null}

        {members.map((member) => (
          <div
            key={member.id}
            className="mx-3 my-3 grid grid-cols-1 gap-4 rounded-xl border border-stone-200 bg-white px-4 py-4 last:border-b-0 md:m-0 md:grid-cols-[1.1fr_1fr_0.8fr_1.6fr] md:gap-3 md:rounded-none md:border-0 md:border-b md:border-stone-100"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-stone-950">{member.display_name || "-"}</p>
              <p className="truncate text-xs text-stone-500">{member.email || member.id}</p>
              <p className="mt-1 text-[11px] text-stone-400">가입: {formatDate(member.created_at)}</p>
            </div>

            <div className="grid gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-stone-400 md:hidden">권한</p>
              <select
                value={roleDrafts[member.id] || "member"}
                onChange={(event) =>
                  setRoleDrafts((current) => ({
                    ...current,
                    [member.id]: event.target.value as Exclude<AccountType, null>,
                  }))
                }
                className="h-9 rounded-lg border border-stone-300 px-2 text-sm outline-none focus:border-stone-900"
              >
                <option value="member">고객</option>
                <option value="salon_owner">살롱 운영자</option>
                <option value="admin">관리자</option>
              </select>
              <Button
                type="button"
                className="h-9 rounded-lg px-3 text-xs"
                disabled={
                  busyKey === `role-${member.id}` ||
                  (roleDrafts[member.id] || "member") === (member.account_type || "member")
                }
                onClick={() => openRoleConfirmation(member)}
              >
                권한 변경
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 md:block">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-stone-400 md:hidden">크레딧</p>
              <span className="text-lg font-black text-stone-900">{member.credits || 0}</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-[100px_minmax(0,1fr)_96px]">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-stone-400 sm:col-span-3 md:hidden">액션</p>
              <Link
                href={`/admin/members/${encodeURIComponent(member.id)}`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-50 sm:col-span-3"
              >
                상세 열람
              </Link>
              <input
                value={creditDrafts[member.id]?.delta || ""}
                onChange={(event) =>
                  setCreditDrafts((current) => ({
                    ...current,
                    [member.id]: {
                      ...current[member.id],
                      delta: event.target.value,
                    },
                  }))
                }
                placeholder="+10 / -5"
                className="h-9 rounded-lg border border-stone-300 px-2 text-sm outline-none focus:border-stone-900"
              />
              <input
                value={creditDrafts[member.id]?.reason || ""}
                onChange={(event) =>
                  setCreditDrafts((current) => ({
                    ...current,
                    [member.id]: {
                      ...current[member.id],
                      reason: event.target.value,
                    },
                  }))
                }
                placeholder="조정 사유"
                className="h-9 rounded-lg border border-stone-300 px-2 text-sm outline-none focus:border-stone-900"
              />
              <Button
                type="button"
                className="h-9 rounded-lg px-3 text-xs"
                disabled={busyKey === `credit-${member.id}`}
                onClick={() => openCreditConfirmation(member)}
              >
                적용
              </Button>
            </div>
          </div>
        ))}
        {nextCursor ? (
          <div className="border-t border-stone-200 p-4 text-center">
            <p className="mb-3 text-xs text-stone-500">
              현재 {members.length.toLocaleString("ko-KR")} / 총 {total.toLocaleString("ko-KR")}명
            </p>
            <Button type="button" variant="secondary" disabled={isLoading} onClick={() => void loadMembers(nextCursor)}>
              {isLoading ? "불러오는 중..." : "회원 더 보기"}
            </Button>
          </div>
        ) : null}
      </section>

      <ConfirmActionDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open && !busyKey) {
            setPendingAction(null);
            setConfirmationText("");
          }
        }}
        onConfirm={() => void executePendingAction()}
        title={pendingAction?.type === "role" ? "회원 권한 변경 확인" : "크레딧 조정 확인"}
        description={
          pendingAction?.type === "role"
            ? "권한 변경은 관리자 화면과 역할별 기능 접근 범위를 즉시 바꿉니다. DB 변경 후 Clerk 권한도 동기화됩니다."
            : "크레딧 원장에 되돌릴 수 없는 조정 내역을 기록합니다. 현재 잔액과 조정 사유를 다시 확인해 주세요."
        }
        target={
          pendingAction
            ? `${pendingAction.member.display_name || "이름 없음"} · ${pendingAction.member.email || pendingAction.member.id}`
            : null
        }
        beforeValue={pendingBefore}
        afterValue={pendingAfter}
        tone="danger"
        confirmLabel={pendingAction?.type === "role" ? "권한 변경 실행" : "크레딧 조정 실행"}
        pendingLabel="감사 영수증 기록 중…"
        isPending={busyKey !== null}
        confirmDisabled={confirmationText !== requiredConfirmation}
        confirmationSlot={
          pendingAction ? (
            <label className="grid gap-2 text-sm font-semibold text-stone-800">
              계속하려면 <strong>{requiredConfirmation}</strong>을 입력하세요.
              <input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                autoComplete="off"
                className="h-10 rounded-lg border border-stone-300 px-3 outline-none focus:border-stone-900"
                aria-label={`${requiredConfirmation} 확인 문구`}
              />
              {pendingAction.type === "credit" ? (
                <span className="text-xs font-medium text-stone-500">조정 사유: {pendingAction.reason}</span>
              ) : null}
            </label>
          ) : null
        }
      />
    </div>
  );
}
