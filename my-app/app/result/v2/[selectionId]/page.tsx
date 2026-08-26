/* eslint-disable @next/next/no-img-element */

import { auth } from "@clerk/nextjs/server";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Palette,
  Plus,
  Scissors,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CustomerPageHeader, CustomerShell } from "../../../../components/customer/CustomerShell";
import { buildSignInRedirectUrl } from "../../../../lib/clerk";
import {
  loadCustomerStyleResultV2,
  type CustomerStyleFactV2,
} from "../../../../lib/v2/customer-history-server";

interface Params {
  params: Promise<{ selectionId: string }>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function ResultFacts({ facts }: { facts: CustomerStyleFactV2[] }) {
  return (
    <dl className="customer-style-result-facts">
      {facts.map((fact) => (
        <div key={`${fact.label}-${fact.value}`}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function CustomerStyleResultV2Page({ params }: Params) {
  const { selectionId } = await params;
  const returnPath = `/result/v2/${encodeURIComponent(selectionId)}`;
  const { userId } = await auth();
  if (!userId) redirect(buildSignInRedirectUrl(returnPath));

  const result = await loadCustomerStyleResultV2(userId, selectionId);
  if (!result) notFound();

  return (
    <CustomerShell activePath="/stylebook">
      <div className="customer-page customer-style-result-page">
        <Link href="/stylebook" className="customer-detail-back">
          <ArrowLeft aria-hidden="true" />
          스타일북
        </Link>

        <CustomerPageHeader
          eyebrow="Style Result V2"
          title="확정 스타일 리설트"
          description="컨설팅에서 최종 선택하고 확정한 V2 스타일 스냅샷을 기준으로 정리했어요."
          action={
            <Link href="/consulting/new" className="customer-primary-button">
              <Plus aria-hidden="true" />
              새 컨설팅
            </Link>
          }
        />

        <section className="customer-card customer-style-result-hero" aria-label="확정 스타일 요약">
          <div className="customer-style-result-hero__visual">
            {result.imageUrl ? (
              <img src={result.imageUrl} alt={`${result.name} 확정 스타일`} />
            ) : (
              <div className="customer-stylebook-card__placeholder" aria-hidden="true">HF</div>
            )}
          </div>
          <div className="customer-style-result-hero__body">
            <span className="customer-style-result-status">
              <BadgeCheck aria-hidden="true" />
              V2 선택 확정
            </span>
            <p className="customer-kicker">Your confirmed style</p>
            <h2>{result.name}</h2>
            <p>{result.recommendationReason}</p>
            <dl className="customer-style-result-meta">
              <div>
                <dt><Sparkles aria-hidden="true" /> 스타일 방향</dt>
                <dd>{result.strategyLabel}</dd>
              </div>
              <div>
                <dt><CalendarDays aria-hidden="true" /> 확정일</dt>
                <dd>{formatDate(result.confirmedAt)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <div className="customer-style-result-layout">
          <section className="customer-card customer-style-result-section">
            <div className="customer-style-result-section__heading">
              <span><Scissors aria-hidden="true" /></span>
              <div>
                <p className="customer-kicker">Design details</p>
                <h2>스타일 디자인</h2>
              </div>
            </div>
            <ResultFacts facts={result.designFacts} />
          </section>

          <div className="customer-style-result-stack">
            {result.colorFacts.length ? (
              <section className="customer-card customer-style-result-section">
                <div className="customer-style-result-section__heading">
                  <span><Palette aria-hidden="true" /></span>
                  <div>
                    <p className="customer-kicker">Color direction</p>
                    <h2>컬러 방향</h2>
                  </div>
                </div>
                <ResultFacts facts={result.colorFacts} />
              </section>
            ) : null}

            <section className="customer-card customer-style-result-section customer-style-result-confirmation">
              <div className="customer-style-result-section__heading">
                <span><BadgeCheck aria-hidden="true" /></span>
                <div>
                  <p className="customer-kicker">Salon check</p>
                  <h2>시술 전 확인</h2>
                </div>
              </div>
              {result.feasibilityFacts.length ? (
                <ResultFacts facts={result.feasibilityFacts} />
              ) : (
                <p className="customer-style-result-muted">시술 가능 여부는 미용실에서 모발 상태를 확인한 뒤 최종 결정해 주세요.</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </CustomerShell>
  );
}
