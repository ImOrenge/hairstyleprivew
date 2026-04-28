import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, ExternalLink, Scissors, Sparkles, TriangleAlert } from "lucide-react";
import type { AftercareGuide, AftercareSectionKey } from "../../../lib/aftercare-guide-generator";
import { buildSignInRedirectUrl } from "../../../lib/clerk";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../../lib/supabase";

interface Params {
  params: Promise<{ hairRecordId: string }>;
}

interface HairRecordRow {
  id: string;
  generation_id: string | null;
  style_name: string;
  service_type: string;
  service_date: string;
  next_visit_target_days: number;
  created_at: string;
}

interface GuideRow {
  id: string;
  guide_json: unknown;
}

const SERVICE_LABELS: Record<string, string> = {
  cut: "커트",
  perm: "펌",
  color: "염색",
  bleach: "탈색",
  treatment: "트리트먼트",
  other: "기타 시술",
};

const SECTION_ORDER: Array<{ key: AftercareSectionKey; label: string }> = [
  { key: "dry", label: "드라이" },
  { key: "treatment", label: "트리트먼트" },
  { key: "iron", label: "고데기" },
  { key: "styling", label: "스타일링" },
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function parseGuide(raw: unknown): AftercareGuide | null {
  if (!isObject(raw) || !isObject(raw.overview) || !isObject(raw.sections)) return null;
  const sections = raw.sections;
  const required = SECTION_ORDER.every(({ key }) => isObject(sections[key]));
  if (!required) return null;
  return raw as unknown as AftercareGuide;
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

function nextVisitDate(serviceDate: string, days: number) {
  const date = new Date(`${serviceDate}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return formatDate(date.toISOString());
}

function InfoPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-stone-400">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-base font-bold text-stone-950">{value}</p>
    </div>
  );
}

export default async function AftercareDetailPage({ params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    redirect(buildSignInRedirectUrl("/aftercare"));
  }

  if (!isSupabaseConfigured()) {
    notFound();
  }

  const { hairRecordId } = await params;
  const supabase = getSupabaseAdminClient();

  const { data: record, error: recordError } = await supabase
    .from("user_hair_records")
    .select("id,generation_id,style_name,service_type,service_date,next_visit_target_days,created_at")
    .eq("id", hairRecordId)
    .eq("user_id", userId)
    .maybeSingle<HairRecordRow>();

  if (recordError || !record) {
    notFound();
  }

  const { data: guideRow, error: guideError } = await supabase
    .from("user_aftercare_guides")
    .select("id,guide_json")
    .eq("hair_record_id", record.id)
    .eq("user_id", userId)
    .maybeSingle<GuideRow>();

  if (guideError || !guideRow) {
    notFound();
  }

  const guide = parseGuide(guideRow.guide_json);
  if (!guide) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6">
      <div>
        <Link href="/aftercare" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-500 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" />
          에프터케어 목록
        </Link>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white px-6 py-6 shadow-[0_20px_70px_-48px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-600">Aftercare Guide</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-stone-950">
              {guide.overview.headline || `${record.style_name} 에프터케어`}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">{guide.overview.summary}</p>
          </div>
          {record.generation_id ? (
            <Link
              href={`/result/${record.generation_id}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 text-sm font-bold text-white transition hover:bg-stone-800"
            >
              결과 다시 보기
              <ExternalLink className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoPill
          icon={<Scissors className="h-4 w-4" />}
          label="시술"
          value={`${record.style_name} · ${SERVICE_LABELS[record.service_type] || record.service_type}`}
        />
        <InfoPill icon={<CalendarDays className="h-4 w-4" />} label="시술일" value={formatDate(record.service_date)} />
        <InfoPill
          icon={<Clock className="h-4 w-4" />}
          label="권장 재방문"
          value={nextVisitDate(record.service_date, record.next_visit_target_days)}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {SECTION_ORDER.map(({ key, label }) => {
          const section = guide.sections[key];
          return (
            <article key={key} className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase text-emerald-600">{label}</p>
                  <h2 className="mt-1 text-xl font-black text-stone-950">{section.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{section.goal}</p>
                </div>
                <span className="rounded-full bg-emerald-50 p-2 text-emerald-700">
                  <Sparkles className="h-4 w-4" />
                </span>
              </div>

              <p className="mt-4 rounded-xl bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700">
                추천 타이밍: {section.timing}
              </p>

              <div className="mt-4">
                <h3 className="text-sm font-bold text-stone-950">실행 순서</h3>
                <ol className="mt-2 grid gap-2">
                  {section.steps.map((step, index) => (
                    <li key={`${key}-step-${index}`} className="flex gap-3 rounded-xl bg-stone-50 px-3 py-3 text-sm leading-6 text-stone-700">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-stone-900 ring-1 ring-stone-200">
                        {index + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <h3 className="text-sm font-bold text-stone-950">추천 제품</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {section.products.map((product) => (
                      <span key={product} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                        {product}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-950">피해야 할 것</h3>
                  <ul className="mt-2 grid gap-1 text-sm leading-6 text-stone-600">
                    {section.avoid.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-xl font-black text-stone-950">관리 일정</h2>
          <div className="mt-4 grid gap-3">
            {guide.maintenanceSchedule.map((item) => (
              <div key={`${item.label}-${item.dayOffset}`} className="flex gap-3 rounded-xl bg-stone-50 px-4 py-3">
                <span className="w-14 shrink-0 text-sm font-black text-emerald-700">{item.label}</span>
                <p className="text-sm leading-6 text-stone-700">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-amber-700" />
            <h2 className="text-lg font-black text-amber-950">주의사항</h2>
          </div>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-amber-900">
            {asStringArray(guide.warnings).map((warning) => (
              <li key={warning}>- {warning}</li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-xl font-black text-stone-950">다음 액션</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {asStringArray(guide.recommendedNextActions).map((action) => (
            <div key={action} className="flex gap-3 rounded-xl bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              {action}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
