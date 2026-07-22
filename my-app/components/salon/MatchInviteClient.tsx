"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, LinkIcon, ShieldCheck } from "lucide-react";
import { createSalonConnectionConsentAcceptance } from "@hairfit/shared/salon/connection-consent";
import { mapWebResponseError } from "../../lib/web-user-message";
import { Button } from "../ui/Button";

interface InviteResponse {
  authenticated?: boolean;
  existingStatus?: string | null;
  existingMatchRequestId?: string | null;
  existingConsentedAt?: string | null;
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
    consentVersion: string;
  };
  consent?: {
    version: string;
    scope: Record<string, unknown>;
    copy: {
      purpose: string;
      sharedItems: readonly string[];
      excludedItems: readonly string[];
      retention: string;
      revocation: string;
    };
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
  const [consentChecked, setConsentChecked] = useState(false);

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
        setError(mapWebResponseError(response.status, "초대 링크를 확인하지 못했습니다. 링크가 만료되지 않았는지 확인해 주세요."));
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
      body: JSON.stringify(createSalonConnectionConsentAcceptance()),
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
      setError(mapWebResponseError(response.status, "초대를 수락하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    }

    setIsSubmitting(false);
  }

  const salon = data?.salon;
  const existingActiveStatus = data?.existingStatus === "pending" || data?.existingStatus === "linked"
    ? data.existingStatus
    : null;
  const alreadyAccepted = acceptedStatus || existingActiveStatus;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
      <header className="space-y-3 border-b border-stone-200 pb-6 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">살롱 연결</p>
        <h1 className="text-3xl font-black tracking-normal text-stone-950">
          살롱 CRM 연결 초대
        </h1>
        <p className="mx-auto max-w-2xl text-sm leading-6 text-stone-500">
          공유할 정보와 연결 해제 후 처리 방식을 확인한 뒤 동의할 수 있습니다.
        </p>
      </header>

      {isLoading ? (
        <section role="status" aria-live="polite" className="rounded-md border border-stone-200 bg-white px-5 py-8 text-center text-sm text-stone-500">
          초대 정보를 확인 중입니다.
        </section>
      ) : null}

      {!isLoading && error ? (
        <section role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
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
            <div className="mt-6 space-y-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <p>
                <CheckCircle2 className="mr-2 inline h-4 w-4" />
                {alreadyAccepted === "linked" ? "이미 CRM 고객으로 연결되었습니다." : "매칭 요청이 살롱 CRM에 전달되었습니다."}
              </p>
              <Link href="/salon/connections" className="inline-flex text-emerald-900 underline underline-offset-4">
                연결 상태 확인·해제
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="rounded-md border border-stone-200 bg-stone-50 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                  <h3 className="text-sm font-black text-stone-950">연결 동의 안내</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-700">{data?.consent?.copy.purpose}</p>
                <h4 className="mt-4 text-xs font-black uppercase tracking-[0.08em] text-stone-500">살롱에 공유</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-stone-700">
                  {data?.consent?.copy.sharedItems.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <h4 className="mt-4 text-xs font-black uppercase tracking-[0.08em] text-stone-500">공유하지 않음</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-stone-700">
                  {data?.consent?.copy.excludedItems.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <p className="mt-4 text-xs leading-5 text-stone-600">{data?.consent?.copy.retention}</p>
                <p className="mt-2 text-xs leading-5 text-stone-600">{data?.consent?.copy.revocation}</p>
              </div>
              <label className="flex items-start gap-3 rounded-md border border-stone-300 bg-white px-4 py-3 text-sm leading-6 text-stone-800">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(event) => setConsentChecked(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>위 공유 범위와 연결 해제 후 처리 내용을 확인했으며 살롱 연결에 동의합니다.</span>
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Link href="/mypage" className="inline-flex min-h-11 items-center justify-center rounded-md border border-stone-300 px-4 text-sm font-bold text-stone-700 hover:bg-stone-50">
                  동의하지 않음
                </Link>
                <Button type="button" onClick={() => void acceptInvite()} disabled={isSubmitting || !consentChecked}>
                  {isSubmitting ? "동의 처리 중..." : data?.authenticated ? "동의하고 연결 요청" : "동의하고 로그인"}
                </Button>
              </div>
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
