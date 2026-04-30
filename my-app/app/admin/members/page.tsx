"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/Button";

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
  error?: string;
}

interface CreditDraft {
  delta: string;
  reason: string;
}

const accountTypeFilters = [
  { value: "all", label: "전체" },
  { value: "member", label: "member" },
  { value: "salon_owner", label: "salon_owner" },
  { value: "admin", label: "admin" },
  { value: "unset", label: "미설정" },
] as const;

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

export default function AdminMembersPage() {
  const [query, setQuery] = useState("");
  const [accountType, setAccountType] = useState<(typeof accountTypeFilters)[number]["value"]>("all");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Exclude<AccountType, null>>>({});
  const [creditDrafts, setCreditDrafts] = useState<Record<string, CreditDraft>>({});

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

  const loadMembers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const response = await fetch(listUrl, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as MemberResponse;

    if (!response.ok) {
      setError(data.error || "회원 목록을 불러오지 못했습니다.");
      setIsLoading(false);
      return;
    }

    const nextMembers = data.members || [];
    setMembers(nextMembers);
    setTotal(data.total || nextMembers.length);
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
        if (!merged[member.id]) {
          merged[member.id] = { delta: "", reason: "" };
        }
      }
      return merged;
    });
    setIsLoading(false);
  }, [listUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMembers();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [loadMembers]);

  async function handleRoleChange(userId: string) {
    const role = roleDrafts[userId];
    if (!role) {
      return;
    }

    setBusyKey(`role-${userId}`);
    setError(null);
    const response = await fetch(`/api/admin/members/${encodeURIComponent(userId)}/account-type`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: role }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(data.error || "계정 유형 변경에 실패했습니다.");
    } else {
      await loadMembers();
    }

    setBusyKey(null);
  }

  async function handleCreditAdjust(userId: string) {
    const draft = creditDrafts[userId];
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

    setBusyKey(`credit-${userId}`);
    setError(null);
    const response = await fetch(`/api/admin/members/${encodeURIComponent(userId)}/credits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta, reason: draft.reason.trim() }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(data.error || "크레딧 조정에 실패했습니다.");
    } else {
      setCreditDrafts((current) => ({
        ...current,
        [userId]: { delta: "", reason: "" },
      }));
      await loadMembers();
    }

    setBusyKey(null);
  }

  return (
    <div className="space-y-4 pb-10">
      <header className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Admin Dashboard</p>
        <h1 className="mt-2 text-2xl font-black text-stone-950">회원관리</h1>
        <p className="mt-2 text-sm text-stone-600">총 {total}명</p>

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
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-stone-200 bg-white">
        <div className="grid grid-cols-[1.1fr_1fr_0.8fr_1.6fr] gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs font-bold text-stone-500">
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
            className="grid grid-cols-1 gap-3 border-b border-stone-100 px-4 py-4 last:border-b-0 md:grid-cols-[1.1fr_1fr_0.8fr_1.6fr]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-stone-950">{member.display_name || "-"}</p>
              <p className="truncate text-xs text-stone-500">{member.email || member.id}</p>
              <p className="mt-1 text-[11px] text-stone-400">가입: {formatDate(member.created_at)}</p>
            </div>

            <div className="grid gap-2">
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
                <option value="member">member</option>
                <option value="salon_owner">salon_owner</option>
                <option value="admin">admin</option>
              </select>
              <Button
                type="button"
                className="h-9 rounded-lg px-3 text-xs"
                disabled={busyKey === `role-${member.id}`}
                onClick={() => void handleRoleChange(member.id)}
              >
                권한 변경
              </Button>
            </div>

            <div className="flex items-center text-lg font-black text-stone-900">{member.credits || 0}</div>

            <div className="grid gap-2 sm:grid-cols-[100px_minmax(0,1fr)_96px]">
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
                onClick={() => void handleCreditAdjust(member.id)}
              >
                적용
              </Button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
