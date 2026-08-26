import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, Plus } from "lucide-react";
import { CustomerPageHeader, CustomerShell } from "../../components/customer/CustomerShell";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { loadCustomerAftercareV2 } from "../../lib/v2/customer-history-server";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function AftercarePage() {
  const { userId } = await auth();
  if (!userId) {
    redirect(buildSignInRedirectUrl("/aftercare"));
  }

  const records = await loadCustomerAftercareV2(userId);

  return (
    <CustomerShell>
      <div className="customer-page">
        <CustomerPageHeader
          eyebrow="Care"
          title="선택한 스타일을 오래, 편안하게"
          description="실제 시술 기록과 HairFit V2 관리 일정, 사후 체크인을 한곳에서 확인하세요."
          action={
            <Link href="/consulting/new" className="customer-primary-button">
              <Plus aria-hidden="true" />
              새 컨설팅
            </Link>
          }
        />

        {records.length === 0 ? (
          <section className="customer-card customer-empty-state">
            <p className="customer-kicker">Care journal</p>
            <h2>아직 확정된 시술이 없어요</h2>
            <p>컨설팅 결과에서 마음에 드는 스타일을 확정하면 맞춤 케어 가이드가 자동으로 준비됩니다.</p>
            <Link href="/consulting/new" className="customer-primary-button">
              첫 컨설팅 시작
              <ArrowRight aria-hidden="true" />
            </Link>
          </section>
        ) : (
          <section className="customer-care-grid" aria-label="케어 가이드 목록">
            {records.map((record) => (
              <Link key={record.actualServiceId} href={`/aftercare/${record.actualServiceId}`} className="customer-card customer-care-card">
                <div className="customer-care-card__visual">
                  {record.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={record.imageUrl} alt={`${record.styleName} 시술 확정 스타일`} />
                  ) : (
                    <div className="customer-stylebook-card__placeholder" aria-hidden="true">HF</div>
                  )}
                </div>
                <div className="customer-care-card__body">
                  <p className="customer-kicker">{record.services.join(" · ") || "시술 기록"}</p>
                  <h2>{record.styleName}</h2>
                  <p><CalendarDays aria-hidden="true" /> 시술일 {formatDate(record.serviceDate)}</p>
                  <div className="customer-care-card__due">
                    <span>관리 프로그램</span>
                    <strong>{record.program ? `${record.program.checkpoints.length}단계 · 체크인 ${record.checkins.length}회` : "준비 중"}</strong>
                  </div>
                </div>
              </Link>
            ))}
          </section>
        )}
      </div>
    </CustomerShell>
  );
}
