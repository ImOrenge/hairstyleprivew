"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConfirmActionDialog } from "../../../../components/ui/ConfirmActionDialog";
import { Button } from "../../../../components/ui/Button";
import type { AdminActionOutcome, AdminActionReceipt } from "../../../../lib/admin-action-receipt";
import { mapWebResponseError } from "../../../../lib/web-user-message";

interface AdminEntitlementGrant {
  id: string; offeringKey: string; offeringVersion: number; customerName: string; description: string;
  quantityGranted: number; quantityConsumed: number; remainingSessions: number;
  status: "active" | "exhausted" | "expired" | "revoked"; effectiveStatus: "active" | "exhausted" | "expired" | "revoked";
  source: string; validFrom: string; expiresAt: string | null; revocable: boolean; revocationBlockedReason: string | null;
}
interface AdminGrantableOffering {
  key: string; version: number; customerName: string; description: string; includedSessions: number; validityLabel: string;
}
interface AdminEntitlementAudit { id: string; actionType: "entitlement_grant" | "entitlement_revoke"; status: string; actorUserId: string; grantId: string | null; reason: string; errorCode: string | null; createdAt: string; completedAt: string | null }
interface DetailResponse {
  user: Record<string, unknown>;
  activity: { generations: Record<string, unknown>[]; stylingSessions: Record<string, unknown>[]; hairRecords: Record<string, unknown>[]; payments: Record<string, unknown>[]; subscriptions: Record<string, unknown>[] };
  salon: { customers: Record<string, unknown>[]; aftercareTasks: Record<string, unknown>[] };
  entitlements: { summary: { activeGrantCount: number; remainingSessions: number; nearestExpiryAt: string | null }; grants: AdminEntitlementGrant[]; grantableOfferings: AdminGrantableOffering[]; auditHistory: AdminEntitlementAudit[] };
  error?: string;
}
interface MutationResponse { outcome?: AdminActionOutcome; receipt?: AdminActionReceipt }
type PendingAction =
  | { type: "grant"; actionKey: string; offering: AdminGrantableOffering; reason: string }
  | { type: "revoke"; actionKey: string; grant: AdminEntitlementGrant; reason: string };

function text(value: unknown) { return typeof value === "string" && value.trim() ? value : "-"; }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function date(value: unknown) {
  if (typeof value !== "string" || !value) return "무기한";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}
function sourceLabel(value: string) {
  if (value === "manual") return "수동 지급";
  if (value === "promotion") return "프로모션";
  if (value === "portone") return "PortOne 결제";
  if (value === "google_play") return "Google Play";
  if (value === "apple_iap") return "Apple IAP";
  return "레거시 전환";
}
function statusLabel(value: AdminEntitlementGrant["effectiveStatus"]) {
  return { active: "활성", exhausted: "소진", expired: "만료", revoked: "회수됨" }[value];
}

function DataSection({ title, rows, render }: { title: string; rows: Record<string, unknown>[]; render: (row: Record<string, unknown>) => string }) {
  return <section className="rounded-2xl border border-stone-200 bg-white"><h2 className="border-b px-4 py-3 text-sm font-bold">{title}</h2><div className="divide-y">{rows.length === 0 ? <p className="px-4 py-6 text-sm text-stone-500">데이터가 없습니다.</p> : rows.map((row, index) => <div key={String(row.id || index)} className="px-4 py-3"><p className="text-sm font-semibold">{render(row)}</p><p className="mt-1 text-xs text-stone-500">{date(row.created_at)}</p></div>)}</div></section>;
}

export default function AdminMemberDetailPage() {
  const userId = useParams<{ userId: string }>()?.userId || "";
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOffering, setSelectedOffering] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [revokeReasons, setRevokeReasons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<AdminActionReceipt | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const response = await fetch(`/api/admin/members/${encodeURIComponent(userId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as DetailResponse;
    if (!response.ok) { setError(mapWebResponseError(response.status, "회원 상세를 불러오지 못했습니다.")); setData(null); }
    else { setData(body); setSelectedOffering((current) => current || body.entitlements.grantableOfferings[0]?.key || ""); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { if (userId) void load(); }, [load, userId]); // eslint-disable-line react-hooks/set-state-in-effect
  const user = data?.user || {};
  const entitlement = data?.entitlements;
  const offering = entitlement?.grantableOfferings.find((item) => item.key === selectedOffering);
  const title = text(user.display_name) !== "-" ? text(user.display_name) : text(user.email) !== "-" ? text(user.email) : userId;

  function prepareGrant() {
    if (!offering || !grantReason.trim()) { setError("지급 상품과 운영 사유를 입력해 주세요."); return; }
    setError(null); setConfirmation(""); setPending({ type: "grant", actionKey: crypto.randomUUID(), offering, reason: grantReason.trim() });
  }
  function prepareRevoke(grant: AdminEntitlementGrant) {
    const reason = revokeReasons[grant.id]?.trim();
    if (!reason) { setError("회수 사유를 입력해 주세요."); return; }
    setError(null); setConfirmation(""); setPending({ type: "revoke", actionKey: crypto.randomUUID(), grant, reason });
  }

  async function execute() {
    if (!pending) return;
    setBusy(true); setError(null);
    const isGrant = pending.type === "grant";
    const url = isGrant
      ? `/api/admin/members/${encodeURIComponent(userId)}/entitlements`
      : `/api/admin/members/${encodeURIComponent(userId)}/entitlements/${encodeURIComponent(pending.grant.id)}/revoke`;
    const body = isGrant
      ? { actionKey: pending.actionKey, offeringKey: pending.offering.key, expectedOfferingVersion: pending.offering.version, reason: pending.reason }
      : { actionKey: pending.actionKey, expectedStatus: "active", expectedQuantityConsumed: 0, reason: pending.reason };
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({})) as MutationResponse;
    if (!response.ok || !result.receipt) setError(response.status === 409 ? "확인하는 동안 이용권 또는 상품 상태가 변경되었습니다. 최신 정보를 확인해 주세요." : mapWebResponseError(response.status, "이용권 작업을 완료하지 못했습니다."));
    else { setReceipt(result.receipt); if (isGrant) setGrantReason(""); else setRevokeReasons((current) => ({ ...current, [pending.grant.id]: "" })); }
    setPending(null); setConfirmation(""); setBusy(false); await load();
  }

  const activity = data?.activity || { generations: [], stylingSessions: [], hairRecords: [], payments: [], subscriptions: [] };
  const salon = data?.salon || { customers: [], aftercareTasks: [] };
  const requiredPhrase = pending?.type === "grant" ? "이용권 지급" : "이용권 회수";

  return <div className="space-y-5 pb-10">
    <Link href="/admin/members" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600"><ArrowLeft className="h-4 w-4" />회원 목록</Link>
    <header className="rounded-2xl border border-stone-200 bg-white p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">회원 상세</p><h1 className="mt-2 text-2xl font-black">{title}</h1><p className="mt-2 break-all text-sm text-stone-500">{userId}</p></header>
    {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
    {receipt ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><p className="font-bold">이용권 작업이 감사 이력에 기록되었습니다.</p><p className="mt-1 break-all font-mono text-xs">감사 영수증 {receipt.id}</p></div> : null}
    {loading ? <p className="text-sm text-stone-500">불러오는 중...</p> : null}
    {!loading && data && entitlement ? <>
      <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold text-stone-400">활성 이용권</p><p className="mt-2 text-2xl font-black">{entitlement.summary.activeGrantCount}건</p></div><div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold text-stone-400">남은 총 회차</p><p className="mt-2 text-2xl font-black">{entitlement.summary.remainingSessions}회</p></div><div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold text-stone-400">가장 가까운 만료</p><p className="mt-2 text-sm font-black">{date(entitlement.summary.nearestExpiryAt)}</p></div></section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5"><h2 className="text-lg font-black">V2 이용권 수동 지급</h2><p className="mt-1 text-sm text-stone-500">최신 활성 풀스타일 상품의 회차·기능·유효기간을 서버 카탈로그에서 적용합니다. 결제 계약 없는 무상 운영 지급입니다.</p><div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><select aria-label="지급 상품" value={selectedOffering} onChange={(event) => setSelectedOffering(event.target.value)} className="h-10 rounded-xl border px-3 text-sm"><option value="">상품 선택</option>{entitlement.grantableOfferings.map((item) => <option key={item.key} value={item.key}>{item.customerName} · v{item.version}</option>)}</select><input aria-label="이용권 지급 사유" value={grantReason} onChange={(event) => setGrantReason(event.target.value)} placeholder="무상 지급 사유" maxLength={240} className="h-10 rounded-xl border px-3 text-sm" /><Button type="button" onClick={prepareGrant}>지급 확인</Button></div>{offering ? <p className="mt-3 text-xs text-stone-600">{offering.includedSessions}회 · {offering.validityLabel} · {offering.description}</p> : null}</section>
      <section className="rounded-2xl border border-stone-200 bg-white"><div className="border-b px-5 py-4"><h2 className="text-lg font-black">이용권 및 감사 상태</h2></div><div className="divide-y">{entitlement.grants.length === 0 ? <p className="px-5 py-8 text-sm text-stone-500">지급된 V2 이용권이 없습니다.</p> : entitlement.grants.map((grant) => <article key={grant.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{grant.customerName}</h3><span className="rounded-full bg-stone-100 px-2 py-1 text-xs">{statusLabel(grant.effectiveStatus)}</span><span className="rounded-full bg-stone-100 px-2 py-1 text-xs">{sourceLabel(grant.source)}</span></div><p className="mt-2 break-all text-xs text-stone-500">{grant.offeringKey} · v{grant.offeringVersion} · {grant.id}</p><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-stone-500">지급 / 사용 / 남은 회차</dt><dd className="font-bold">{grant.quantityGranted} / {grant.quantityConsumed} / {grant.remainingSessions}</dd></div><div><dt className="text-xs text-stone-500">유효기간</dt><dd className="font-bold">{date(grant.validFrom)} ~ {date(grant.expiresAt)}</dd></div></dl></div><div><input aria-label={`${grant.customerName} 회수 사유`} value={revokeReasons[grant.id] || ""} onChange={(event) => setRevokeReasons((current) => ({ ...current, [grant.id]: event.target.value }))} disabled={!grant.revocable} maxLength={240} placeholder={grant.revocable ? "회수 사유" : "회수 불가"} className="h-10 w-full rounded-xl border px-3 text-sm disabled:bg-stone-100" /><Button type="button" variant="secondary" className="mt-2 w-full" disabled={!grant.revocable} onClick={() => prepareRevoke(grant)}>회수 확인</Button>{grant.revocationBlockedReason ? <p className="mt-2 text-xs text-amber-700">{grant.revocationBlockedReason}</p> : null}</div></article>)}</div></section>
      <section className="rounded-2xl border border-stone-200 bg-white"><div className="border-b px-5 py-4"><h2 className="text-lg font-black">이용권 감사 이력</h2></div><div className="divide-y">{entitlement.auditHistory.length === 0 ? <p className="px-5 py-8 text-sm text-stone-500">기록된 관리자 이용권 작업이 없습니다.</p> : entitlement.auditHistory.map((audit) => <article key={audit.id} className="px-5 py-4 text-sm"><div className="flex flex-wrap items-center gap-2"><strong>{audit.actionType === "entitlement_grant" ? "수동 지급" : "수동 회수"}</strong><span className="rounded-full bg-stone-100 px-2 py-1 text-xs">{audit.status}</span></div><p className="mt-2 text-stone-700">사유: {audit.reason || "기록 없음"}</p><p className="mt-1 break-all text-xs text-stone-500">영수증 {audit.id} · 이용권 {audit.grantId || "생성 전"} · 처리자 {audit.actorUserId} · {date(audit.completedAt || audit.createdAt)}</p>{audit.errorCode ? <p className="mt-1 text-xs text-rose-700">오류 코드: {audit.errorCode}</p> : null}</article>)}</div></section>
      <div className="grid gap-4 xl:grid-cols-2"><DataSection title="헤어 생성 기록" rows={activity.generations} render={(row) => `${text(row.status)} · ${text(row.prompt_used)}`} /><DataSection title="패션 추천 세션" rows={activity.stylingSessions} render={(row) => `${text(row.status)} · ${text(row.genre || row.occasion)}`} /><DataSection title="결제 내역" rows={activity.payments} render={(row) => `${text(row.status)} · ${number(row.amount).toLocaleString("ko-KR")}`} /><DataSection title="구독" rows={activity.subscriptions} render={(row) => `${text(row.plan_key)} · ${text(row.status)}`} /><DataSection title="살롱 고객" rows={salon.customers} render={(row) => `${text(row.name)} · ${text(row.phone)}`} /><DataSection title="살롱 사후관리" rows={salon.aftercareTasks} render={(row) => `${text(row.status)} · ${text(row.channel)}`} /></div>
    </> : null}
    <ConfirmActionDialog open={pending !== null} onOpenChange={(open) => { if (!open && !busy) { setPending(null); setConfirmation(""); } }} onConfirm={() => void execute()} title={pending?.type === "grant" ? "이용권 지급 확인" : "이용권 회수 확인"} description={pending?.type === "grant" ? "무상 운영 지급으로 결제·갱신·환불 계약은 생성되지 않습니다." : "삭제하지 않고 revoked 상태로 바꾸며 감사 이력을 보존합니다."} target={pending?.type === "grant" ? pending.offering.customerName : pending?.grant.customerName || null} beforeValue={pending?.type === "revoke" ? `${statusLabel(pending.grant.effectiveStatus)} · 남은 ${pending.grant.remainingSessions}회` : "미지급"} afterValue={pending?.type === "grant" ? `${pending.offering.includedSessions}회 · ${pending.offering.validityLabel}` : "회수됨"} tone="danger" confirmLabel={requiredPhrase} pendingLabel="감사 영수증 기록 중…" isPending={busy} confirmDisabled={confirmation !== requiredPhrase} confirmationSlot={pending ? <label className="grid gap-2 text-sm font-semibold">계속하려면 <strong>{requiredPhrase}</strong>을 입력하세요.<input aria-label={`${requiredPhrase} 확인 문구`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-10 rounded-lg border px-3" /><span className="text-xs font-normal text-stone-500">사유: {pending.reason}</span></label> : null} />
  </div>;
}
