/* eslint-disable @next/next/no-img-element */

import { auth } from "@clerk/nextjs/server";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  ExternalLink,
  Scissors,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CustomerPageHeader, CustomerShell } from "../../../components/customer/CustomerShell";
import { buildSignInRedirectUrl } from "../../../lib/clerk";
import {
  loadCustomerAftercareRecordV2,
  type CustomerAftercareCheckinV2,
} from "../../../lib/v2/customer-history-server";

interface Params {
  params: Promise<{ hairRecordId: string }>;
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

function checkinStatus(checkin: CustomerAftercareCheckinV2) {
  if (checkin.state === "ready") return { label: "답변 완료", tone: "ready" };
  if (checkin.state === "preparing") return { label: "답변 준비 중", tone: "preparing" };
  if (checkin.state === "failed") return { label: "다시 확인 필요", tone: "failed" };
  const due = checkin.scheduledFor <= new Date().toISOString().slice(0, 10);
  return due ? { label: "작성 가능", tone: "available" } : { label: "예정", tone: "locked" };
}

export default async function AftercareDetailPage({ params }: Params) {
  const { userId } = await auth();
  if (!userId) redirect(buildSignInRedirectUrl("/aftercare"));

  const { hairRecordId: actualServiceId } = await params;
  const record = await loadCustomerAftercareRecordV2(userId, actualServiceId);
  if (!record) notFound();

  return (
    <CustomerShell>
      <div className="customer-page customer-aftercare-detail">
        <Link href="/aftercare" className="customer-detail-back">
          <ArrowLeft aria-hidden="true" />
          케어 목록
        </Link>

        <CustomerPageHeader
          eyebrow="V2 Aftercare"
          title={`${record.styleName} 관리 기록`}
          description="확정 스타일과 실제 시술을 기준으로 준비된 오늘 관리, 단계별 일정, 사후 체크인이에요."
          action={
            <Link href={`/consulting/${encodeURIComponent(record.consultationId)}/aftercare`} className="customer-primary-button">
              상담 케어 열기
              <ExternalLink aria-hidden="true" />
            </Link>
          }
        />

        <section className="customer-card customer-aftercare-hero" aria-label="확정 시술 요약">
          <div className="customer-aftercare-hero__visual">
            {record.imageUrl ? (
              <img src={record.imageUrl} alt={`${record.styleName} 확정 스타일`} />
            ) : (
              <div className="customer-stylebook-card__placeholder" aria-hidden="true">HF</div>
            )}
          </div>
          <div className="customer-aftercare-hero__body">
            <p className="customer-kicker">Actual service</p>
            <h2>{record.styleName}</h2>
            <p>{record.recommendationReason}</p>
            <dl className="customer-aftercare-facts">
              <div>
                <dt><Scissors aria-hidden="true" /> 실제 시술</dt>
                <dd>{record.services.join(" · ") || "시술 기록"}</dd>
              </div>
              <div>
                <dt><CalendarDays aria-hidden="true" /> 시술일</dt>
                <dd>{formatDate(record.serviceDate)}</dd>
              </div>
              <div>
                <dt><Sparkles aria-hidden="true" /> 프로그램</dt>
                <dd>{record.program ? `V${record.program.version}` : "준비 중"}</dd>
              </div>
            </dl>
          </div>
        </section>

        {record.program ? (
          <div className="customer-aftercare-layout">
            <div className="customer-aftercare-stack">
              <section className="customer-card customer-aftercare-section">
                <div className="customer-aftercare-section__heading">
                  <span><Sparkles aria-hidden="true" /></span>
                  <div>
                    <p className="customer-kicker">Today</p>
                    <h2>오늘의 관리</h2>
                  </div>
                </div>
                <ol className="customer-aftercare-action-list">
                  {record.program.today.map((item, index) => (
                    <li key={`${index}-${item}`}>
                      <span>{index + 1}</span>
                      <p>{item}</p>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="customer-card customer-aftercare-section">
                <div className="customer-aftercare-section__heading">
                  <span><Clock3 aria-hidden="true" /></span>
                  <div>
                    <p className="customer-kicker">Timeline</p>
                    <h2>단계별 관리 일정</h2>
                  </div>
                </div>
                <div className="customer-aftercare-timeline">
                  {record.program.checkpoints.map((checkpoint) => (
                    <article key={checkpoint.offset}>
                      <div className={checkpoint.complete ? "is-complete" : undefined}>
                        {checkpoint.complete ? <Check aria-hidden="true" /> : null}
                      </div>
                      <strong>{checkpoint.offset}</strong>
                      <p>{checkpoint.action}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <aside className="customer-aftercare-stack">
              <section className="customer-card customer-aftercare-section">
                <div className="customer-aftercare-section__heading">
                  <span><CalendarDays aria-hidden="true" /></span>
                  <div>
                    <p className="customer-kicker">Check-in</p>
                    <h2>사후 체크인</h2>
                  </div>
                </div>
                {record.checkins.length ? (
                  <div className="customer-aftercare-checkins">
                    {record.checkins.map((checkin) => {
                      const status = checkinStatus(checkin);
                      return (
                        <article key={checkin.id}>
                          <div>
                            <strong>D+{checkin.offsetDays}</strong>
                            <time dateTime={checkin.scheduledFor}>{formatDate(checkin.scheduledFor)}</time>
                          </div>
                          <span data-tone={status.tone}>{status.label}</span>
                          {checkin.responseTitle ? <h3>{checkin.responseTitle}</h3> : null}
                          {checkin.responseSummary ? <p>{checkin.responseSummary}</p> : null}
                          {checkin.failureMessage ? <p>{checkin.failureMessage}</p> : null}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="customer-aftercare-muted">이 시술에 연결된 체크인이 아직 없어요.</p>
                )}
              </section>

              {record.program.concerns.length || record.designerNotes ? (
                <section className="customer-card customer-aftercare-section customer-aftercare-note">
                  <div className="customer-aftercare-section__heading">
                    <span><CircleAlert aria-hidden="true" /></span>
                    <div>
                      <p className="customer-kicker">Notes</p>
                      <h2>주의와 메모</h2>
                    </div>
                  </div>
                  {record.program.concerns.length ? (
                    <ul>
                      {record.program.concerns.map((concern) => <li key={concern}>{concern}</li>)}
                    </ul>
                  ) : null}
                  {record.designerNotes ? <p>{record.designerNotes}</p> : null}
                </section>
              ) : null}
            </aside>
          </div>
        ) : (
          <section className="customer-card customer-empty-state">
            <p className="customer-kicker">Preparing</p>
            <h2>관리 프로그램을 준비하고 있어요</h2>
            <p>실제 시술 기록은 안전하게 저장되었습니다. 잠시 뒤 상담 케어에서 다시 확인해 주세요.</p>
          </section>
        )}
      </div>
    </CustomerShell>
  );
}
