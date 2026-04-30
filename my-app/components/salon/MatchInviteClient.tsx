"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, LinkIcon } from "lucide-react";
import { Button } from "../ui/Button";

interface InviteResponse {
  authenticated?: boolean;
  existingStatus?: string | null;
  salon?: {
    shopName: string;
    managerName: string;
    contactPhone: string;
    region: string;
    instagramHandle: string;
    introduction: string;
  };
  invite?: {
    code: string;
    expiresAt: string | null;
  };
  error?: string;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function MatchInviteClient({ code }: { code: string }) {
  const [data, setData] = useState<InviteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedStatus, setAcceptedStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadInvite() {
      setIsLoading(true);
      const response = await fetch(`/api/salon/match/${encodeURIComponent(code)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as InviteResponse;

      if (!active) {
        return;
      }

      if (response.ok) {
        setData(payload);
        setError(null);
      } else {
        setError(payload.error || "초대 링크를 확인하지 못했습니다.");
      }

      setIsLoading(false);
    }

    void loadInvite();

    return () => {
      active = false;
    };
  }, [code]);

  async function acceptInvite() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const response = await fetch(`/api/salon/match/${encodeURIComponent(code)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const payload = (await response.json().catch(() => ({}))) as InviteResponse & { status?: string };

    if (response.status === 401) {
      const returnPath = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/login?redirect_url=${encodeURIComponent(returnPath)}`;
      return;
    }

    if (response.ok) {
      setAcceptedStatus(payload.status || "pending");
    } else if (response.status === 403) {
      setError("회원 계정으로 온보딩을 완료한 뒤 초대를 수락할 수 있습니다.");
    } else {
      setError(payload.error || "초대를 수락하지 못했습니다.");
    }

    setIsSubmitting(false);
  }

  const salon = data?.salon;
  const alreadyAccepted = acceptedStatus || data?.existingStatus;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
      <header className="space-y-3 border-b border-stone-200 pb-6 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Salon Matching</p>
        <h1 className="text-3xl font-black tracking-normal text-stone-950">
          살롱 CRM 연결 초대
        </h1>
        <p className="mx-auto max-w-2xl text-sm leading-6 text-stone-500">
          초대를 수락하면 해당 살롱이 CRM에서 회원 정보를 확인하고 고객 기록으로 연결할 수 있습니다.
        </p>
      </header>

      {isLoading ? (
        <section className="rounded-md border border-stone-200 bg-white px-5 py-8 text-center text-sm text-stone-500">
          초대 정보를 확인 중입니다.
        </section>
      ) : null}

      {!isLoading && error ? (
        <section className="rounded-md border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          {error}
        </section>
      ) : null}

      {!isLoading && salon ? (
        <section className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <span className="rounded-md bg-emerald-50 p-2 text-emerald-700">
              <LinkIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-black text-stone-950">{salon.shopName}</h2>
              <p className="mt-1 text-sm text-stone-500">
                {[salon.region, salon.managerName].filter(Boolean).join(" · ") || "HairFit 제휴 살롱"}
              </p>
              {salon.introduction ? (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-stone-600">{salon.introduction}</p>
              ) : null}
              {data?.invite?.expiresAt ? (
                <p className="mt-4 text-xs text-stone-400">초대 만료일: {formatDate(data.invite.expiresAt)}</p>
              ) : null}
            </div>
          </div>

          {alreadyAccepted ? (
            <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="mr-2 inline h-4 w-4" />
              {alreadyAccepted === "linked" ? "이미 CRM 고객으로 연결되었습니다." : "매칭 요청이 살롱 CRM에 전달되었습니다."}
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-stone-500">
                수락 후 살롱이 고객 기록 연결을 완료할 때까지 대기 상태로 표시됩니다.
              </p>
              <Button type="button" onClick={() => void acceptInvite()} disabled={isSubmitting}>
                {isSubmitting ? "수락 중..." : "초대 수락"}
              </Button>
            </div>
          )}
        </section>
      ) : null}

      <div className="text-center">
        <Link href="/mypage" className="text-sm font-semibold text-stone-600 hover:text-stone-950">
          마이페이지로 이동
        </Link>
      </div>
    </div>
  );
}
