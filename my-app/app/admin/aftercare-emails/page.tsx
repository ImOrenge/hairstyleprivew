"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../../../components/ui/Button";

type OutboxRow = {
  id: string;
  checkpoint: string;
  subject: string;
  recipient_email: string;
  scheduled_send_at: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  provider_last_event: string | null;
  last_error_kind: string | null;
};

type LegacyRow = {
  legacy_care_content_id: string;
  original_scheduled_send_at: string;
  source_snapshot: { subject?: string; contentType?: string; wasOverdueAtMigration?: boolean };
};

const FILTERS = ["held_for_review", "pending", "provider_accepted", "delivered", "delivery_unknown", "bounced", "dead_letter", "cancelled"];

export default function AdminAftercareEmailsPage() {
  const [status, setStatus] = useState("held_for_review");
  const [emails, setEmails] = useState<OutboxRow[]>([]);
  const [legacyHeld, setLegacyHeld] = useState<LegacyRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(`/api/admin/aftercare-emails?status=${encodeURIComponent(status)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { emails?: OutboxRow[]; legacyHeld?: LegacyRow[]; counts?: Record<string, number>; error?: string };
    if (!response.ok) throw new Error(payload.error || "에프터케어 메일 현황을 불러오지 못했습니다.");
    setEmails(payload.emails || []);
    setLegacyHeld(payload.legacyHeld || []);
    setCounts(payload.counts || {});
  }, [status]);

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "조회에 실패했습니다.")); }, [load]);

  const act = async (input: { outboxId?: string; legacyCareContentId?: string; action: "release" | "cancel" | "retry" }) => {
    const id = input.outboxId || input.legacyCareContentId || "";
    let scheduledSendAt: string | undefined;
    if (input.action === "release") {
      const entered = window.prompt("재예약 시각을 입력하세요. 예: 2026-08-22T09:00:00+09:00");
      if (!entered) return;
      const parsed = new Date(entered);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        setError("현재보다 미래인 올바른 재예약 시각을 입력해 주세요.");
        return;
      }
      scheduledSendAt = parsed.toISOString();
    }
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/admin/aftercare-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, scheduledSendAt }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "운영 작업을 완료하지 못했습니다.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "운영 작업을 완료하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  return <main className="grid gap-5 py-5">
    <header className="app-panel grid gap-3 p-5"><div><p className="app-kicker">Delivery operations</p><h1 className="mt-2 text-2xl font-black">에프터케어 이메일 운영</h1><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">격리 건은 한 건씩 검토해 미래 시각으로만 재예약합니다. 해제해도 발송 플래그가 OFF면 실제 발송되지 않습니다.</p></div><div className="flex flex-wrap gap-2">{FILTERS.map((filter) => <button key={filter} type="button" onClick={() => setStatus(filter)} aria-pressed={status === filter} className={`min-h-10 border px-3 text-xs font-black ${status === filter ? "border-[var(--app-foreground)] bg-[var(--app-foreground)] text-[var(--app-background)]" : "border-[var(--app-border)]"}`}>{filter} · {counts[filter] || 0}</button>)}</div></header>
    {error ? <p role="alert" className="border border-[var(--app-danger)] bg-[var(--app-danger-bg)] p-3 text-sm">{error}</p> : null}
    {status === "held_for_review" && legacyHeld.length ? <section className="app-panel grid gap-3 p-5"><h2 className="text-lg font-black">기존 HTML 격리 · {legacyHeld.length}건</h2>{legacyHeld.map((row) => <article key={row.legacy_care_content_id} className="grid gap-3 border-t border-[var(--app-border)] pt-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-black">{row.source_snapshot.subject || row.source_snapshot.contentType || "레거시 에프터케어"}</p><p className="mt-1 text-xs text-[var(--app-muted)]">원래 예약 {new Date(row.original_scheduled_send_at).toLocaleString("ko-KR")} · {row.source_snapshot.wasOverdueAtMigration ? "기한 경과" : "미래 일정"}</p></div><div className="flex gap-2"><Button variant="secondary" disabled={busyId === row.legacy_care_content_id} onClick={() => void act({ legacyCareContentId: row.legacy_care_content_id, action: "cancel" })}>취소</Button><Button disabled={busyId === row.legacy_care_content_id} onClick={() => void act({ legacyCareContentId: row.legacy_care_content_id, action: "release" })}>검토 후 재예약</Button></div></article>)}</section> : null}
    <section className="app-panel grid gap-3 p-5"><h2 className="text-lg font-black">Durable outbox · {emails.length}건</h2>{emails.length ? emails.map((row) => <article key={row.id} className="grid gap-3 border-t border-[var(--app-border)] pt-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-black">{row.subject}</p><p className="mt-1 text-xs text-[var(--app-muted)]">{row.checkpoint} · {row.status} · {new Date(row.scheduled_send_at).toLocaleString("ko-KR")} · 시도 {row.attempt_count}/{row.max_attempts}</p><p className="mt-1 text-xs text-[var(--app-muted)]">{row.provider_last_event || row.last_error_kind || "provider event 없음"}</p></div><div className="flex gap-2">{["dead_letter","delivery_unknown","bounced"].includes(row.status) ? <Button disabled={busyId === row.id} onClick={() => void act({ outboxId: row.id, action: "retry" })}>명시적 재시도</Button> : null}{!["delivered","provider_accepted","cancelled"].includes(row.status) ? <Button variant="secondary" disabled={busyId === row.id} onClick={() => void act({ outboxId: row.id, action: "cancel" })}>취소</Button> : null}</div></article>) : <p className="text-sm text-[var(--app-muted)]">선택한 상태의 outbox가 없습니다.</p>}</section>
  </main>;
}
