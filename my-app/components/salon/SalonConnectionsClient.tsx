"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Link2Off, ShieldCheck } from "lucide-react";
import type { SalonConnectionSummary } from "../../lib/salon-crm-types";
import { mapWebResponseError } from "../../lib/web-user-message";
import { Button } from "../ui/Button";
import { ConfirmActionDialog } from "../ui/ConfirmActionDialog";
import { Panel, SurfaceCard } from "../ui/Surface";

interface MemberConnection extends SalonConnectionSummary {
  salon: {
    shopName: string;
    managerName: string;
    contactPhone: string;
    region: string;
  };
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SalonConnectionsClient() {
  const [connections, setConnections] = useState<MemberConnection[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<MemberConnection | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const response = await fetch("/api/salon/connections", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as {
      connections?: MemberConnection[];
      error?: string;
    };

    if (response.ok) {
      setConnections(payload.connections || []);
    } else {
      setError(mapWebResponseError(response.status, "살롱 연결을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadConnections();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadConnections]);

  async function revokeConnection() {
    if (!confirmTarget || pendingId) return;
    setPendingId(confirmTarget.id);
    setError(null);

    const response = await fetch(`/api/salon/matches/${encodeURIComponent(confirmTarget.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "member_requested" }),
    });
    if (response.ok) {
      setConnections((current) => current.filter((item) => item.id !== confirmTarget.id));
      setConfirmTarget(null);
    } else {
      setError(mapWebResponseError(response.status, "살롱 연결을 해제하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    }
    setPendingId(null);
  }

  return (
    <div className="space-y-5">
      <Panel as="header" className="p-5 sm:p-6">
        <p className="app-kicker">개인정보 및 동의</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--app-text)]">살롱 연결 관리</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
          연결 상태와 동의 시점을 확인하고 언제든 연결을 해제할 수 있습니다.
        </p>
      </Panel>

      {error ? (
        <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700" role="alert">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <SurfaceCard className="p-6 text-sm text-[var(--app-muted)]">연결 상태를 확인하고 있습니다.</SurfaceCard>
      ) : null}

      {!isLoading && connections.length === 0 ? (
        <SurfaceCard className="p-6 text-center">
          <Link2Off className="mx-auto h-6 w-6 text-[var(--app-muted)]" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold text-[var(--app-text)]">활성 살롱 연결이 없습니다.</p>
          <p className="mt-1 text-sm text-[var(--app-muted)]">연결 초대를 거절하거나 해제해도 HairFit의 일반 기능은 그대로 사용할 수 있습니다.</p>
        </SurfaceCard>
      ) : null}

      <div className="grid gap-4">
        {connections.map((connection) => (
          <SurfaceCard as="article" key={connection.id} className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                  <h2 className="truncate text-lg font-black text-[var(--app-text)]">{connection.salon.shopName}</h2>
                </div>
                <p className="mt-2 text-sm text-[var(--app-muted)]">
                  {[connection.salon.region, connection.salon.managerName].filter(Boolean).join(" · ") || "HairFit 제휴 살롱"}
                </p>
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-bold text-[var(--app-muted)]">상태</dt>
                    <dd className="mt-1 font-semibold text-[var(--app-text)]">{connection.status === "linked" ? "연결됨" : "살롱 확인 대기"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-[var(--app-muted)]">동의 시각</dt>
                    <dd className="mt-1 font-semibold text-[var(--app-text)]">{formatDate(connection.consentedAt)}</dd>
                  </div>
                </dl>
              </div>
              <Button type="button" variant="secondary" onClick={() => setConfirmTarget(connection)}>
                연결 해제
              </Button>
            </div>
          </SurfaceCard>
        ))}
      </div>

      <div className="text-center">
        <Link href="/mypage?tab=account" className="text-sm font-bold text-[var(--app-muted)] hover:text-[var(--app-text)]">
          계정으로 돌아가기
        </Link>
      </div>

      <ConfirmActionDialog
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => {
          if (!open && !pendingId) setConfirmTarget(null);
        }}
        onConfirm={() => void revokeConnection()}
        title="살롱 연결을 해제할까요?"
        description="해제 즉시 살롱은 회원 프로필과 HairFit 생성·확정 기록을 더 이상 조회할 수 없습니다."
        confirmLabel="연결 해제"
        pendingLabel="해제 중…"
        isPending={Boolean(pendingId)}
        tone="danger"
        target={confirmTarget?.salon.shopName}
        afterValue="살롱 작성 고객 기록만 일반 고객 기록으로 유지"
      />
    </div>
  );
}
