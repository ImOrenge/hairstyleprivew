import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, Scissors } from "lucide-react";
import { AppPage, Panel, SurfaceCard } from "../../components/ui/Surface";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../lib/supabase";

interface HairRecordRow {
  id: string;
  style_name: string;
  service_type: string;
  service_date: string;
  next_visit_target_days: number;
  created_at: string;
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
      .select("id,style_name,service_type,service_date,next_visit_target_days,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      records = data as HairRecordRow[];
    }
  }

  return (
    <AppPage as="main" className="flex flex-col gap-6 pb-16 pt-8">
      <Panel as="section" className="px-6 py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-600">Aftercare</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)]">에프터케어</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
              확정한 헤어스타일별 드라이, 트리트먼트, 고데기, 스타일링 방법을 다시 확인하세요.
            </p>
          </div>
          <Link
            href="/upload"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 text-sm font-bold text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
          >
            새 스타일 만들기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Panel>

      {records.length === 0 ? (
        <SurfaceCard as="section" className="border-dashed px-6 py-12 text-center">
          <Scissors className="mx-auto h-10 w-10 text-[var(--app-subtle)]" />
          <h2 className="mt-4 text-lg font-black text-[var(--app-text)]">아직 확정된 시술이 없습니다.</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--app-muted)]">
            헤어 결과 페이지에서 마음에 드는 스타일을 시술 확정하면 에프터케어 가이드가 생성됩니다.
          </p>
          <Link
            href="/generate"
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-4 text-sm font-bold text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
          >
            결과 만들러 가기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </SurfaceCard>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {records.map((record) => (
            <Link
              key={record.id}
              href={`/aftercare/${record.id}`}
              className="app-card group p-5 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-600">
                    {SERVICE_LABELS[record.service_type] || record.service_type}
                  </p>
                  <h2 className="mt-2 truncate text-xl font-black text-[var(--app-text)]">{record.style_name}</h2>
                </div>
                <span className="rounded-[var(--app-radius-control)] bg-[var(--app-surface)] p-2 text-[var(--app-muted)] transition group-hover:bg-[var(--app-success-bg)] group-hover:text-[var(--app-success)]">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-5 grid gap-3 text-sm text-[var(--app-muted)]">
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-[var(--app-subtle)]" />
                  시술일 {formatDate(record.service_date)}
                </p>
                <p className="app-card px-3 py-2">
                  권장 재방문: {nextVisitDate(record.service_date, record.next_visit_target_days)}
                </p>
              </div>
            </Link>
          ))}
        </section>
      )}
    </AppPage>
  );
}
