import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { StyleProfileForm } from "../../components/mypage/StyleProfileForm";
import { Card } from "../../components/ui/Card";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { getCreditsPerStyle } from "../../lib/pricing-plan";
import { getSupabaseAdminClient, isSupabaseConfigured } from "../../lib/supabase";

type SearchParams = Record<string, string | string[] | undefined>;

interface UserProfileRow {
  credits?: number;
  display_name?: string | null;
}

interface PaymentTransactionRow {
  metadata?: unknown;
}

interface GenerationRow {
  id: string;
  created_at: string;
  prompt_used?: string | null;
  status?: string | null;
}

interface UserStyleProfileRow {
  height_cm?: number | null;
  body_shape?: string | null;
  top_size?: string | null;
  bottom_size?: string | null;
  fit_preference?: string | null;
  exposure_preference?: string | null;
  body_photo_path?: string | null;
}

interface QueryError {
  message: string;
}

interface PaymentTxSelectBuilder {
  eq: (column: string, value: unknown) => PaymentTxSelectBuilder;
  order: (
    column: string,
    options: { ascending: boolean; nullsFirst?: boolean },
  ) => PaymentTxSelectBuilder;
  limit: (count: number) => {
    maybeSingle: () => Promise<{ data: PaymentTransactionRow | null; error: QueryError | null }>;
  };
}

interface GenerationSelectBuilder {
  eq: (column: string, value: unknown) => GenerationSelectBuilder;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => GenerationSelectBuilder;
  limit: (count: number) => Promise<{ data: GenerationRow[] | null; error: QueryError | null }>;
}

interface StyleProfileSelectBuilder {
  eq: (column: string, value: unknown) => {
    maybeSingle: () => Promise<{ data: UserStyleProfileRow | null; error: QueryError | null }>;
  };
}

function pickFirst(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function getPlanFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as { plan?: unknown }).plan;
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return normalized;
}

function formatPlanLabel(planKey: string | null): string {
  if (!planKey) {
    return "무료";
  }

  if (planKey === "starter") {
    return "스타터";
  }

  if (planKey === "pro") {
    return "프로";
  }

  return planKey.charAt(0).toUpperCase() + planKey.slice(1);
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrompt(prompt: string | null | undefined): string {
  const value = prompt?.trim();
  if (!value) {
    return "제목 없는 생성 결과";
  }

  if (value.length <= 72) {
    return value;
  }

  return `${value.slice(0, 72)}...`;
}

function formatGenerationStatus(status: string | null | undefined): string {
  const normalized = status?.trim().toLowerCase();

  if (!normalized) {
    return "상태 확인 중";
  }

  if (normalized === "completed") {
    return "완료";
  }

  if (normalized === "processing" || normalized === "running") {
    return "생성 중";
  }

  if (normalized === "queued" || normalized === "pending") {
    return "대기 중";
  }

  if (normalized === "failed" || normalized === "error") {
    return "실패";
  }

  return normalized;
}

function getStatusTone(status: string | null | undefined): string {
  const normalized = status?.trim().toLowerCase();

  if (normalized === "completed") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (normalized === "failed" || normalized === "error") {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }

  if (normalized === "processing" || normalized === "running") {
    return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
  }

  return "bg-stone-100 text-stone-700 ring-1 ring-stone-200";
}

function getDisplayName(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return trimmed;
  }

  const emailName = email.split("@")[0]?.trim();
  if (emailName) {
    return emailName;
  }

  return "HairFit 사용자";
}

function isProfileReady(profile: UserStyleProfileRow | null): boolean {
  if (!profile) {
    return false;
  }

  return Boolean(
    profile.height_cm &&
      profile.body_shape &&
      profile.top_size &&
      profile.bottom_size &&
      profile.fit_preference &&
      profile.exposure_preference &&
      profile.body_photo_path,
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-stone-200/80 bg-white px-5 py-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.18)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-stone-900">{value}</p>
      <p className="mt-2 text-sm text-stone-500">{helper}</p>
    </div>
  );
}

function QuickActionLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-stone-200 bg-white px-4 py-4 transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_16px_40px_-28px_rgba(15,23,42,0.3)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-stone-900">{label}</p>
          <p className="mt-1 text-sm leading-5 text-stone-500">{description}</p>
        </div>
        <span className="rounded-full bg-stone-100 p-2 text-stone-500 transition group-hover:bg-stone-900 group-hover:text-white">
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

function ChecklistItem({
  label,
  ready,
}: {
  label: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <span
        className={`rounded-full px-3 py-1 text-xs font-bold ${
          ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {ready ? "준비됨" : "필요"}
      </span>
    </div>
  );
}

export default async function MyPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect(buildSignInRedirectUrl("/mypage"));
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const payment = pickFirst(resolvedSearchParams.payment);
  const checkoutId = pickFirst(resolvedSearchParams.checkout_id);

  const clerkUser = await currentUser();
  const fallbackEmail = `${userId}@placeholder.local`;
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress?.trim() ??
    clerkUser?.emailAddresses?.[0]?.emailAddress?.trim() ??
    fallbackEmail;
  const displayName =
    clerkUser?.fullName?.trim() ??
    clerkUser?.firstName?.trim() ??
    clerkUser?.username?.trim() ??
    null;

  let profile: UserProfileRow | null = null;
  let latestPaidTx: PaymentTransactionRow | null = null;
  let generations: GenerationRow[] = [];
  let styleProfile: UserStyleProfileRow | null = null;

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient() as never as {
      rpc: (
        fn: string,
        params: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      from: (table: string) => { select: (columns: string) => unknown };
    };

    const ensured = await supabase.rpc("ensure_user_profile", {
      p_user_id: userId,
      p_email: email,
      p_display_name: displayName,
    });

    if (!ensured.error) {
      profile = (ensured.data as UserProfileRow | null) ?? null;
    }

    const txSelect = supabase
      .from("payment_transactions")
      .select("metadata") as PaymentTxSelectBuilder;

    const txResult = await txSelect
      .eq("user_id", userId)
      .eq("status", "paid")
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!txResult.error) {
      latestPaidTx = txResult.data;
    }

    const generationSelect = supabase
      .from("generations")
      .select("id, created_at, prompt_used, status") as GenerationSelectBuilder;

    const generationResult = await generationSelect
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!generationResult.error && generationResult.data) {
      generations = generationResult.data;
    }

    const styleProfileSelect = supabase
      .from("user_style_profiles")
      .select("height_cm, body_shape, top_size, bottom_size, fit_preference, exposure_preference, body_photo_path") as StyleProfileSelectBuilder;

    const styleProfileResult = await styleProfileSelect
      .eq("user_id", userId)
      .maybeSingle();

    if (!styleProfileResult.error) {
      styleProfile = styleProfileResult.data;
    }
  }

  const credits = Number.isInteger(profile?.credits) ? Number(profile?.credits) : 0;
  const creditsPerStyle = getCreditsPerStyle();
  const estimatedStyles = creditsPerStyle > 0 ? Math.floor(credits / creditsPerStyle) : 0;
  const activePlan = formatPlanLabel(getPlanFromMetadata(latestPaidTx?.metadata));
  const viewerName = getDisplayName(displayName ?? profile?.display_name, email);
  const activityCount = generations.length;
  const profileReady = isProfileReady(styleProfile);
  const hasBodyPhoto = Boolean(styleProfile?.body_photo_path);
  const hasGenerationHistory = activityCount > 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6">
      <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(250,244,235,0.96))] px-6 py-6 shadow-[0_25px_80px_-45px_rgba(15,23,42,0.28)] sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-black px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
                My Dashboard
              </span>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                {activePlan} 플랜
              </span>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-stone-900 sm:text-4xl">
                {viewerName}님, 오늘의 스타일 준비 상태입니다.
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600 sm:text-base">
                크레딧 잔액, 프로필 완성도, 최근 생성 기록을 한 화면에서 확인하고 바로 다음 작업으로 이동할 수 있습니다.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
            <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-400">현재 플랜</p>
              <p className="mt-2 text-xl font-bold text-stone-900">{activePlan}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-400">크레딧 정책</p>
              <p className="mt-2 text-xl font-bold text-stone-900">{creditsPerStyle} credits</p>
              <p className="mt-1 text-xs text-stone-500">스타일 1회 생성 기준</p>
            </div>
          </div>
        </div>

        {payment === "success" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            결제가 확인되었습니다. 크레딧이 잠시 후 반영됩니다.
            {checkoutId ? ` 체크아웃 ID: ${checkoutId}` : ""}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="남은 크레딧"
          value={credits.toLocaleString("ko-KR")}
          helper="현재 바로 사용할 수 있는 생성 잔액"
        />
        <MetricCard
          label="예상 생성 가능"
          value={estimatedStyles.toLocaleString("ko-KR")}
          helper={`${creditsPerStyle} credits 기준으로 계산한 예상 횟수`}
        />
        <MetricCard
          label="최근 활동"
          value={activityCount.toLocaleString("ko-KR")}
          helper="최근 10개 생성 기록 기준"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card
            title="프로필 설정"
            description="전신 사진과 체형 정보를 저장해 스타일러 추천 흐름을 바로 시작할 수 있도록 준비합니다."
            className="rounded-[2rem] border-stone-200/80 px-6 py-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.3)]"
          >
            <StyleProfileForm variant="dashboard" />
          </Card>

          <Card
            title="최근 생성 기록"
            description="가장 최근 생성 결과를 빠르게 다시 열고 현재 상태를 확인할 수 있습니다."
            className="rounded-[2rem] border-stone-200/80 px-6 py-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.3)]"
          >
            <div className="grid gap-3">
              {generations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-8 text-center">
                  <p className="text-sm font-semibold text-stone-900">아직 생성 기록이 없습니다.</p>
                  <p className="mt-2 text-sm leading-6 text-stone-500">
                    첫 이미지를 업로드하고 AI 헤어 추천 보드를 만들어 보세요.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <Link
                      href="/upload"
                      className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                    >
                      이미지 업로드 시작
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ) : (
                generations.map((item) => (
                  <Link
                    key={item.id}
                    href={`/result/${item.id}`}
                    className="group rounded-[1.5rem] border border-stone-200 bg-white px-4 py-4 transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_18px_50px_-34px_rgba(15,23,42,0.3)]"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusTone(item.status)}`}>
                            {formatGenerationStatus(item.status)}
                          </span>
                          <span className="text-xs font-medium text-stone-400">{formatDate(item.created_at)}</span>
                        </div>
                        <p className="mt-3 text-base font-semibold text-stone-900">{formatPrompt(item.prompt_used)}</p>
                        <p className="mt-1 text-xs text-stone-500">{item.id}</p>
                      </div>

                      <div className="inline-flex items-center gap-2 self-start rounded-full bg-stone-100 px-3 py-2 text-sm font-medium text-stone-700 transition group-hover:bg-stone-900 group-hover:text-white">
                        결과 보기
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Card
            title="빠른 액션"
            description="가장 자주 쓰는 흐름으로 바로 이동합니다."
            className="rounded-[2rem] border-stone-200/80 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.3)]"
          >
            <div className="grid gap-3">
              <QuickActionLink
                href="/upload"
                label="이미지 업로드"
                description="새 얼굴 이미지를 올리고 추천 흐름을 시작합니다."
              />
              <QuickActionLink
                href="/generate"
                label="헤어 생성 보드"
                description="업로드한 이미지로 3x3 추천 보드 생성을 진행합니다."
              />
              <QuickActionLink
                href="/styler/new"
                label="패션 스타일러"
                description="확정한 헤어 결과를 바탕으로 룩북 생성 흐름으로 이동합니다."
              />
            </div>
          </Card>

          <Card
            title="계정 요약"
            description="현재 사용 중인 플랜과 생성 기준을 다시 확인합니다."
            className="rounded-[2rem] border-stone-200/80 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.3)]"
          >
            <div className="grid gap-3 text-sm text-stone-700">
              <div className="rounded-2xl bg-stone-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">활성 플랜</p>
                <p className="mt-2 text-base font-semibold text-stone-900">{activePlan}</p>
              </div>
              <div className="rounded-2xl bg-stone-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">남은 크레딧</p>
                <p className="mt-2 text-base font-semibold text-stone-900">{credits.toLocaleString("ko-KR")}</p>
              </div>
              <div className="rounded-2xl bg-stone-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">생성 기준</p>
                <p className="mt-2 text-base font-semibold text-stone-900">
                  스타일 1회당 {creditsPerStyle} credits
                </p>
              </div>
            </div>
          </Card>

          <Card
            title="준비 상태"
            description="스타일러와 생성 흐름에 필요한 핵심 조건만 빠르게 점검합니다."
            className="rounded-[2rem] border-stone-200/80 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.3)]"
          >
            <div className="grid gap-3">
              <ChecklistItem label="바디 프로필 완성" ready={profileReady} />
              <ChecklistItem label="전신 사진 저장" ready={hasBodyPhoto} />
              <ChecklistItem label="생성 기록 보유" ready={hasGenerationHistory} />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
