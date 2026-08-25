import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, Plus } from "lucide-react";
import { CustomerPageHeader, CustomerShell } from "../../components/customer/CustomerShell";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { getConfirmedStyleMediaFromRelation } from "../../lib/confirmed-style-media";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../lib/supabase";

interface HairRecordRow {
  id: string;
  style_name: string;
  service_type: string;
  service_date: string;
  next_visit_target_days: number;
  created_at: string;
  generation?: unknown;
  selected_variant_image_url?: string | null;
}

const SERVICE_LABELS: Record<string, string> = {
  cut: "커트",
  perm: "펌",
  color: "염색",
  bleach: "탈색",
  treatment: "트리트먼트",
  other: "기타 시술",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function nextVisitDate(serviceDate: string, days: number) {
  const date = new Date(`${serviceDate}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return formatDate(date.toISOString());
}

export default async function AftercarePage() {
  const { userId } = await auth();
  if (!userId) {
    redirect(buildSignInRedirectUrl("/aftercare"));
  }

  let records: HairRecordRow[] = [];

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("user_hair_records")
      .select("id,style_name,service_type,service_date,next_visit_target_days,created_at,generation:generations(selected_variant_id,options)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      records = (data as HairRecordRow[]).map((record) => ({
        ...record,
        selected_variant_image_url: getConfirmedStyleMediaFromRelation(record.generation).selectedVariantImageUrl,
      }));
    }
  }

  return (
    <CustomerShell>
      <div className="customer-page">
        <CustomerPageHeader
          eyebrow="Care"
          title="선택한 스타일을 오래, 편안하게"
          description="시술일과 모발 상태에 맞춘 드라이·트리트먼트·스타일링 가이드를 한곳에서 확인하세요."
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
              <Link key={record.id} href={`/aftercare/${record.id}`} className="customer-card customer-care-card">
                <div className="customer-care-card__visual">
                  {record.selected_variant_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={record.selected_variant_image_url} alt={`${record.style_name} 시술 확정 스타일`} />
                  ) : (
                    <div className="customer-stylebook-card__placeholder" aria-hidden="true">HF</div>
                  )}
                </div>
                <div className="customer-care-card__body">
                  <p className="customer-kicker">{SERVICE_LABELS[record.service_type] || record.service_type}</p>
                  <h2>{record.style_name}</h2>
                  <p><CalendarDays aria-hidden="true" /> 시술일 {formatDate(record.service_date)}</p>
                  <div className="customer-care-card__due">
                    <span>권장 재방문</span>
                    <strong>{nextVisitDate(record.service_date, record.next_visit_target_days)}</strong>
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
