"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmActionDialog } from "../../../components/ui/ConfirmActionDialog";
import { Button } from "../../../components/ui/Button";
import type { AdminActionOutcome, AdminActionReceipt } from "../../../lib/admin-action-receipt";
import { mapWebResponseError } from "../../../lib/web-user-message";

type AccountType = "member" | "salon_owner" | "admin" | null;
interface MemberRow {
  id: string; email: string | null; display_name: string | null; account_type: AccountType;
  onboarding_completed_at: string | null; created_at: string; updated_at: string;
  entitlementSummary: { activeGrantCount: number; remainingSessions: number; nearestExpiryAt: string | null };
}
interface MemberResponse { members?: MemberRow[]; total?: number; nextCursor?: string | null }
interface PendingRoleAction { actionKey: string; member: MemberRow; expectedAccountType: Exclude<AccountType, null>; accountType: Exclude<AccountType, null> }
interface MutationResponse { outcome?: AdminActionOutcome; receipt?: AdminActionReceipt }

const filters = [["all", "전체"], ["member", "고객"], ["salon_owner", "살롱 운영자"], ["admin", "관리자"], ["unset", "미설정"]] as const;

function roleLabel(value: AccountType) {
  if (value === "admin") return "관리자";
  if (value === "salon_owner") return "살롱 운영자";
  if (value === "member") return "고객";
  return "미설정";
}

function formatDate(value: string | null) {
  if (!value) return "없음";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ko-KR");
}

export default function AdminMembersPage() {
  const [query, setQuery] = useState("");
  const [accountType, setAccountType] = useState<(typeof filters)[number][0]>("all");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Exclude<AccountType, null>>>({});
  const [pending, setPending] = useState<PendingRoleAction | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [actionNotice, setActionNotice] = useState<{ outcome: AdminActionOutcome; receipt: AdminActionReceipt } | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (query.trim()) params.set("q", query.trim());
    if (accountType !== "all") params.set("accountType", accountType);
    return `/api/admin/members?${params.toString()}`;
  }, [query, accountType]);

  const load = useCallback(async (cursor?: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError(null);
    try {
      const url = new URL(listUrl, window.location.origin);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(`${url.pathname}${url.search}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => ({})) as MemberResponse;
      if (!response.ok) throw new Error(mapWebResponseError(response.status, "회원 목록을 불러오지 못했습니다."));
      const rows = body.members || [];
      setMembers((current) => cursor ? [...current, ...rows] : rows);
      if (!cursor) setTotal(body.total || rows.length);
      setNextCursor(body.nextCursor || null);
      setRoleDrafts((current) => ({ ...current, ...Object.fromEntries(rows.map((row) => [row.id, current[row.id] || row.account_type || "member"])) }));
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "회원 목록 요청에 실패했습니다.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => { window.clearTimeout(timer); abort.current?.abort(); };
  }, [load]);

  async function changeRole() {
    if (!pending) return;
    setBusy(true);
    const response = await fetch(`/api/admin/members/${encodeURIComponent(pending.member.id)}/account-type`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionKey: pending.actionKey, expectedAccountType: pending.expectedAccountType, accountType: pending.accountType }),
    });
    const body = await response.json().catch(() => ({})) as MutationResponse;
    if (!response.ok || !body.receipt) setError(mapWebResponseError(response.status, "권한 변경에 실패했습니다."));
    else setActionNotice({ outcome: body.outcome || "succeeded", receipt: body.receipt });
    setPending(null); setConfirmation(""); setBusy(false); await load();
  }

  return <div className="space-y-4 pb-10">
    <header className="rounded-2xl border border-stone-200 bg-white p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">관리자 대시보드</p>
      <h1 className="mt-2 text-2xl font-black text-stone-950">회원관리</h1>
      <p className="mt-2 text-sm text-stone-600">총 {total}명 · 목록 조회와 권한 변경이 가능하며, 이용권 지급과 회수는 회원 상세에서 관리합니다.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <input aria-label="회원 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="user id / email / 이름 검색" className="h-10 rounded-xl border border-stone-300 px-3 text-sm" />
        <select aria-label="회원 권한 필터" value={accountType} onChange={(event) => setAccountType(event.target.value as typeof accountType)} className="h-10 rounded-xl border border-stone-300 px-3 text-sm">{filters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </div>
    </header>
    {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
    {actionNotice ? <div role={actionNotice.outcome === "failed" || actionNotice.outcome === "conflict" ? "alert" : "status"} aria-live={actionNotice.outcome === "failed" || actionNotice.outcome === "conflict" ? "assertive" : "polite"} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">권한 변경 감사 영수증 <span className="break-all font-mono text-xs">{actionNotice.receipt.id}</span></div> : null}
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="hidden grid-cols-[1.25fr_1fr_1.2fr_0.7fr] gap-4 border-b bg-stone-50 px-4 py-3 text-xs font-bold text-stone-500 md:grid"><span>회원</span><span>권한</span><span>이용권</span><span>관리</span></div>
      {loading ? <p className="px-4 py-8 text-sm text-stone-500">불러오는 중...</p> : null}
      {!loading && members.length === 0 ? <p className="px-4 py-8 text-sm text-stone-500">조회된 회원이 없습니다.</p> : null}
      {members.map((member) => <article key={member.id} className="grid gap-4 border-b border-stone-100 px-4 py-4 last:border-0 md:grid-cols-[1.25fr_1fr_1.2fr_0.7fr]">
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{member.display_name || "-"}</p><p className="truncate text-xs text-stone-500">{member.email || member.id}</p><p className="mt-1 text-[11px] text-stone-400">가입 {formatDate(member.created_at)}</p></div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] md:grid-cols-1"><select aria-label={`${member.display_name || member.email || member.id} 권한`} value={roleDrafts[member.id] || "member"} onChange={(event) => setRoleDrafts((current) => ({ ...current, [member.id]: event.target.value as Exclude<AccountType, null> }))} className="h-9 min-w-0 rounded-lg border border-stone-300 px-2 text-sm"><option value="member">고객</option><option value="salon_owner">살롱 운영자</option><option value="admin">관리자</option></select><Button type="button" className="h-9 rounded-lg px-3 text-xs" disabled={(roleDrafts[member.id] || "member") === (member.account_type || "member")} onClick={() => { setConfirmation(""); setPending({ actionKey: crypto.randomUUID(), member, expectedAccountType: member.account_type || "member", accountType: roleDrafts[member.id] || "member" }); }}>권한 변경</Button></div>
        <div className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600"><p className="font-bold text-stone-900">활성 {member.entitlementSummary.activeGrantCount}건 · 남은 {member.entitlementSummary.remainingSessions}회</p><p className="mt-1">가장 가까운 만료 {formatDate(member.entitlementSummary.nearestExpiryAt)}</p></div>
        <Link href={`/admin/members/${encodeURIComponent(member.id)}`} className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 px-3 text-xs font-semibold hover:bg-stone-50">상세 관리</Link>
      </article>)}
      {nextCursor ? <div className="border-t p-4 text-center"><p className="mb-3 text-xs text-stone-500">현재 {members.length.toLocaleString("ko-KR")} / 총 {total.toLocaleString("ko-KR")}명</p><Button type="button" variant="secondary" disabled={loading} onClick={() => void load(nextCursor)}>회원 더 보기</Button></div> : null}
    </section>
    <ConfirmActionDialog open={pending !== null} onOpenChange={(open) => { if (!open && !busy) { setPending(null); setConfirmation(""); } }} onConfirm={() => void changeRole()} title="회원 권한 변경 확인" description="권한 변경은 기능 접근 범위를 즉시 바꾸며 감사 영수증에 기록됩니다." target={pending ? `${pending.member.display_name || "이름 없음"} · ${pending.member.email || pending.member.id}` : null} beforeValue={pending ? roleLabel(pending.expectedAccountType) : null} afterValue={pending ? roleLabel(pending.accountType) : null} tone="danger" confirmLabel="권한 변경 실행" pendingLabel="기록 중…" isPending={busy} confirmDisabled={confirmation !== "권한 변경"} confirmationSlot={pending ? <label className="grid gap-2 text-sm font-semibold">계속하려면 <strong>권한 변경</strong>을 입력하세요.<input aria-label="권한 변경 확인 문구" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-10 rounded-lg border border-stone-300 px-3" /></label> : null} />
  </div>;
}
