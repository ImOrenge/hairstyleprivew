"use client";

/* eslint-disable @next/next/no-img-element */

import type { PaidActionExecutionReceipt } from "@hairfit/shared";
import Link from "next/link";
import { PaidActionQuoteCard } from "../billing/PaidActionQuoteCard";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { AppPage, SurfaceCard } from "../ui/Surface";
import {
  formatWebStylerNotificationStatus,
  formatWebStylerStatus,
  WEB_STYLER_GENRE_LABELS,
} from "./stylerSessionModel";
import type { StylerSessionController } from "./useStylerSessionController";

function StylerCreditReceiptNotice({ receipt }: { receipt: PaidActionExecutionReceipt }) {
  if (receipt.state === "reserved") {
    return (
      <InlineAlert title={`${receipt.costCredits}크레딧 예약됨`} tone="info">
        <p>룩북 생성이 완료되면 차감이 확정되고, 실패하면 예약 금액이 자동 복구됩니다.</p>
        <p className="mt-1 text-xs">예약 후 잔액 {receipt.balanceAfter}크레딧</p>
      </InlineAlert>
    );
  }
  if (receipt.state === "charged") {
    return (
      <InlineAlert title={`${receipt.chargedCredits}크레딧 차감 완료`} tone="success">
        <p>룩북 이미지가 완성되어 예약한 크레딧의 차감이 확정되었습니다.</p>
        <p className="mt-1 text-xs">처리 후 잔액 {receipt.balanceAfter}크레딧</p>
        {receipt.replayed ? <p className="mt-1 text-xs">기존 완료 영수증을 다시 확인했습니다.</p> : null}
      </InlineAlert>
    );
  }
  if (receipt.state === "refunded") {
    return (
      <InlineAlert title={`${receipt.refundedCredits}크레딧 자동 복구 완료`} tone="success">
        <p>룩북 생성에 실패해 예약했던 크레딧을 계정으로 되돌렸습니다.</p>
        <p className="mt-1 text-xs">복구 후 잔액 {receipt.balanceAfter}크레딧</p>
      </InlineAlert>
    );
  }
  return (
    <InlineAlert title="추가 크레딧 차감 없음" tone="success">
      <p>{receipt.freeReason || "이 실행에는 크레딧이 차감되지 않았습니다."}</p>
      <p className="mt-1 text-xs">처리 후 잔액 {receipt.balanceAfter}크레딧</p>
    </InlineAlert>
  );
}

interface StylerSessionViewProps {
  controller: StylerSessionController;
}

export function StylerSessionView({ controller }: StylerSessionViewProps) {
  const {
    actionError,
    billingHref,
    error,
    handleGenerate,
    isGenerating,
    isLoading,
    quote,
    quoteError,
    quoteExpired,
    quoteLoading,
    refreshQuote,
    session,
  } = controller;
  const recommendation = session?.recommendation || null;
  const genre = session?.genre || recommendation?.genre || null;
  const canGenerate = session?.status === "recommended" || session?.status === "failed";
  const notificationMessage = formatWebStylerNotificationStatus(session?.completionNotificationStatus);

  return (
    <AppPage className="flex flex-col gap-6 pb-20 pt-8">
      <header className="space-y-2 text-center">
        <p className="app-kicker">패션 룩북</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--app-text)]">{recommendation?.headline || "패션 추천 결과"}</h1>
        <p className="mx-auto max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
          선택한 헤어스타일과 저장된 바디 프로필을 바탕으로 만든 전신 코디 이미지입니다. 실제 피팅을 보장하는 가상 착장은 아니며, 스타일 방향을 확인하기 위한 룩북입니다.
        </p>
      </header>

      {isLoading && !session ? <SurfaceCard className="p-6 text-center text-sm text-[var(--app-muted)]">패션 결과를 불러오는 중입니다...</SurfaceCard> : null}
      {error ? <InlineAlert title="패션 결과 상태를 확인하지 못했습니다" tone="danger">{error}</InlineAlert> : null}

      {session ? (
        <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <SurfaceCard className="overflow-hidden p-0">
            <div className="aspect-[3/4]">
              {session.imageUrl ? (
                <img
                  className="h-full w-full object-cover"
                  src={session.imageUrl}
                  alt="생성된 패션 룩북 이미지"
                  decoding="async"
                  fetchPriority="high"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-500">
                  {session.status === "generating"
                    ? "룩북 이미지를 생성하고 있습니다. 이 화면은 3초마다 상태를 확인합니다."
                    : `룩북 이미지를 아직 사용할 수 없습니다. 현재 상태: ${formatWebStylerStatus(session.status)}`}
                </div>
              )}
            </div>
          </SurfaceCard>

          <aside className="space-y-4">
            <SurfaceCard as="section" className="p-5">
              <p className="app-kicker">추천 요약</p>
              <p className="mt-3 text-sm leading-6 text-[var(--app-text)]">{recommendation?.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(recommendation?.palette || []).map((color) => <span className="app-chip px-3 py-1 text-xs font-medium" key={color}>{color}</span>)}
              </div>
              <p className="mt-4 text-xs text-[var(--app-muted)]">
                장르: {genre ? WEB_STYLER_GENRE_LABELS[genre] : session.occasion} · 상태: {formatWebStylerStatus(session.status)} · 사용 크레딧: {session.creditsUsed}
              </p>
            </SurfaceCard>

            {session.status === "generating" ? (
              <InlineAlert title="백그라운드 생성이 접수되었습니다" tone="info">
                이 페이지를 닫거나 다른 화면으로 이동해도 서버에서 계속 생성합니다. 완료되면 계정 이메일로 안내하며, 이 화면은 열려 있는 동안 3초마다 상태를 확인합니다.
              </InlineAlert>
            ) : null}
            {session.status === "completed" ? <InlineAlert title="룩북 생성 완료" tone="success">완성된 이미지와 확정된 크레딧 영수증을 확인할 수 있습니다.</InlineAlert> : null}
            {session.status === "failed" ? <InlineAlert title="룩북 생성 실패" tone="danger">{session.errorMessage || "예약 크레딧 복구 상태를 확인한 뒤 새 견적으로 다시 시도해 주세요."}</InlineAlert> : null}
            {session.status === "recommended" ? <InlineAlert title="룩북 생성 준비 완료" tone="info">아래 최신 견적을 확인한 뒤 생성 버튼을 눌러야 크레딧 예약과 이미지 생성이 시작됩니다.</InlineAlert> : null}
            {notificationMessage ? (
              <InlineAlert
                title="완료 알림 상태"
                tone={session.completionNotificationStatus === "sent" ? "success" : "info"}
              >
                {notificationMessage}
              </InlineAlert>
            ) : null}

            {session.creditReceipt ? (
              <StylerCreditReceiptNotice receipt={session.creditReceipt} />
            ) : session.status === "generating" ? (
              <InlineAlert title="크레딧 예약 영수증 확인 중" tone="info">서버에서 예약 상태를 불러오고 있습니다.</InlineAlert>
            ) : null}

            {canGenerate ? (
              <>
                <PaidActionQuoteCard
                  billingHref={billingHref}
                  error={quoteError}
                  loading={quoteLoading}
                  onRefresh={refreshQuote}
                  payerLabel="내 HairFit 계정"
                  quote={quote}
                />
                {actionError ? <InlineAlert title="룩북 생성을 시작하지 못했습니다" tone="danger">{actionError}</InlineAlert> : null}
                <Button
                  className="w-full"
                  disabled={isGenerating || quoteLoading || !quote || quoteExpired || !quote.isAllowed}
                  onClick={handleGenerate}
                  type="button"
                >
                  {isGenerating
                    ? "생성 요청 처리 중..."
                    : quote
                      ? session.status === "failed"
                        ? `${quote.costCredits}크레딧으로 다시 생성`
                        : `${quote.costCredits}크레딧으로 룩북 생성`
                      : "견적 확인 후 룩북 생성"}
                </Button>
              </>
            ) : actionError ? (
              <InlineAlert title="생성 요청 확인이 필요합니다" tone="warning">{actionError}</InlineAlert>
            ) : null}

            <SurfaceCard as="section" className="p-5">
              <p className="app-kicker">스타일링 메모</p>
              <div className="mt-3 grid gap-2">
                {(recommendation?.stylingNotes || []).map((note) => <p data-pointer-glow="surface" className="app-card px-3 py-2 text-sm text-[var(--app-text)]" key={note}>{note}</p>)}
              </div>
            </SurfaceCard>
            <div className="flex flex-wrap gap-3">
              <Link href={`/result/${session.generationId}?variant=${encodeURIComponent(session.selectedVariantId)}`}>
                <Button type="button" variant="secondary">헤어 결과로 돌아가기</Button>
              </Link>
              <Link href="/styler/new"><Button type="button" variant="secondary">새 패션 추천 만들기</Button></Link>
            </div>
          </aside>
        </section>
      ) : null}

      {recommendation ? (
        <section className="space-y-4">
          <div>
            <p className="app-kicker">추천 아이템</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--app-text)]">코디 구성</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {recommendation.items.map((item) => (
              <SurfaceCard as="article" className="p-4" key={item.slot}>
                <p className="app-kicker">{item.slot}</p>
                <h3 className="mt-2 text-base font-bold text-[var(--app-text)]">{item.name}</h3>
                <p className="mt-2 text-sm leading-5 text-[var(--app-muted)]">{item.description}</p>
                <dl className="mt-3 grid gap-1 text-xs text-[var(--app-subtle)]">
                  <div>색상: {item.color}</div>
                  <div>핏: {item.fit}</div>
                  <div>소재: {item.material}</div>
                  <div>브랜드: {item.brandName || "브랜드 연동 예정"}</div>
                </dl>
              </SurfaceCard>
            ))}
          </div>
        </section>
      ) : null}
    </AppPage>
  );
}
