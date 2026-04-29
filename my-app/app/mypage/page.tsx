import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { StyleProfileForm } from "../../components/mypage/StyleProfileForm";
import { Card } from "../../components/ui/Card";
import { AppPage, Panel, SurfaceCard } from "../../components/ui/Surface";
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
  return normalized || null;
}

function formatPlanLabel(planKey: string | null): string {
  if (!planKey) return "무료";
  if (planKey === "starter") return "스타터";
  if (planKey === "pro") return "프로";
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

  return value.length <= 72 ? value : `${value.slice(0, 72)}...`;
}

function formatGenerationStatus(status: string | null | undefined): string {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return "상태 확인 중";
  if (normalized === "completed") return "완료";
  if (normalized === "processing" || normalized === "running") return "생성 중";
  if (normalized === "queued" || normalized === "pending") return "대기 중";
  if (normalized === "failed" || normalized === "error") return "실패";
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
    return "bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)] ring-1 ring-[var(--app-accent)]";
  }

  return "bg-[var(--app-surface-muted)] text-[var(--app-text)] ring-1 ring-stone-200";
}

function getDisplayName(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;

  const emailName = email.split("@")[0]?.trim();
  if (emailName) return emailName;

  return "HairFit 사용자";
}

function isProfileReady(profile: UserStyleProfileRow | null): boolean {
  if (!profile) return false;

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
    <SurfaceCard className="px-5 py-5">
      <p className="text-[11px] font-bold uppercase text-[var(--app-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-[var(--app-text)]">{value}</p>
      <p className="mt-2 text-sm text-[var(--app-muted)]">{helper}</p>
    </SurfaceCard>
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
      className="app-card group px-4 py-4 transition hover:-translate-y-0.5 hover:border-[var(--app-border-strong)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--app-text)]">{label}</p>
          <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">{description}</p>
        </div>
        <span className="rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] p-2 text-[var(--app-muted)] transition group-hover:bg-stone-900 group-hover:text-white">
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
    <SurfaceCard className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm font-medium text-[var(--app-text)]">{label}</span>
      <span
        className={`rounded-[var(--app-radius-control)] px-3 py-1 text-xs font-bold ${
          ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {ready ? "준비됨" : "필요"}
      </span>
    </SurfaceCard>
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
    <AppPage className="flex flex-col gap-6 pb-16">
      <Panel as="section" className="overflow-hidden px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-[var(--app-radius-control)] bg-black px-3 py-1 text-xs font-bold uppercase text-white">
                마이 대시보드
              </span>
              <span className="rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--app-text)] ring-1 ring-stone-200">
                {activePlan} 플랜
              </span>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
                {viewerName}님의 스타일 준비 상태입니다
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-muted)] sm:text-base">
                보유 크레딧, 최근 헤어 생성 기록, 패션 추천에 필요한 바디 프로필을 한 화면에서 확인하세요.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
            <SurfaceCard className="px-4 py-4">
              <p className="text-[11px] font-bold uppercase text-[var(--app-muted)]">현재 플랜</p>
              <p className="mt-2 text-xl font-bold text-[var(--app-text)]">{activePlan}</p>
            </SurfaceCard>
            <SurfaceCard className="px-4 py-4">
              <p className="text-[11px] font-bold uppercase text-[var(--app-muted)]">생성 기준</p>
              <p className="mt-2 text-xl font-bold text-[var(--app-text)]">{creditsPerStyle} credits</p>
              <p className="mt-1 text-xs text-[var(--app-muted)]">헤어스타일 1회 생성 기준</p>
            </SurfaceCard>
          </div>
        </div>

        {payment === "success" ? (
          <div className="mt-6 rounded-[var(--app-radius-panel)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            결제가 확인되었습니다. 크레딧이 곧 반영됩니다.
            {checkoutId ? ` 체크아웃 ID: ${checkoutId}` : ""}
          </div>
        ) : null}
      </Panel>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="보유 크레딧"
          value={credits.toLocaleString("ko-KR")}
          helper="현재 바로 사용할 수 있는 생성 크레딧"
        />
        <MetricCard
          label="예상 생성 가능"
          value={estimatedStyles.toLocaleString("ko-KR")}
          helper={`${creditsPerStyle} credits 기준 예상 횟수`}
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
            title="바디 프로필 설정"
            description="전신 사진과 체형 정보를 저장해 헤어스타일 이후 패션 추천 흐름을 바로 시작할 수 있게 준비합니다."
            className="px-6 py-6"
          >
            <StyleProfileForm variant="dashboard" />
          </Card>

          <Card
            title="최근 생성 기록"
            description="가장 최근 헤어 생성 결과를 빠르게 다시 열고 패션 추천으로 이어갈 수 있습니다."
            className="px-6 py-6"
          >
            <div className="grid gap-3">
              {generations.length === 0 ? (
                <SurfaceCard className="border-dashed px-5 py-8 text-center">
                  <p className="text-sm font-semibold text-[var(--app-text)]">아직 생성 기록이 없습니다.</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
                    첫 이미지를 업로드하고 AI 헤어 추천 보드를 만들어 보세요.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <Link
                      href="/upload"
                      className="inline-flex items-center gap-2 rounded-[var(--app-radius-control)] bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                    >
                      이미지 업로드 시작
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </SurfaceCard>
              ) : (
                generations.map((item) => (
                  <Link
                    key={item.id}
                    href={`/result/${item.id}`}
                    className="app-card group px-4 py-4 transition hover:-translate-y-0.5 hover:border-[var(--app-border-strong)]"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-[var(--app-radius-control)] px-3 py-1 text-xs font-bold ${getStatusTone(item.status)}`}>
                            {formatGenerationStatus(item.status)}
                          </span>
                          <span className="text-xs font-medium text-[var(--app-muted)]">{formatDate(item.created_at)}</span>
                        </div>
                        <p className="mt-3 text-base font-semibold text-[var(--app-text)]">{formatPrompt(item.prompt_used)}</p>
                        <p className="mt-1 text-xs text-[var(--app-muted)]">{item.id}</p>
                      </div>

                      <div className="inline-flex items-center gap-2 self-start rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] px-3 py-2 text-sm font-medium text-[var(--app-text)] transition group-hover:bg-stone-900 group-hover:text-white">
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
            title="빠른 실행"
            description="자주 쓰는 흐름으로 바로 이동합니다."
            className=""
          >
            <div className="grid gap-3">
              <QuickActionLink
                href="/upload"
                label="이미지 업로드"
                description="얼굴 사진을 올리고 추천 흐름을 시작합니다."
              />
              <QuickActionLink
                href="/generate"
                label="헤어 생성 보드"
                description="업로드한 이미지로 3x3 추천 보드 생성을 진행합니다."
              />
              <QuickActionLink
                href="/styler/new"
                label="패션 추천"
                description="확정한 헤어 결과를 바탕으로 장르별 코디를 만듭니다."
              />
              <QuickActionLink
                href="/aftercare"
                label="에프터케어"
                description="확정한 헤어별 드라이, 트리트먼트, 고데기, 스타일링 방법을 확인합니다."
              />
            </div>
          </Card>

          <Card
            title="계정 요약"
            description="현재 사용 중인 플랜과 생성 기준을 확인합니다."
            className=""
          >
            <div className="grid gap-3 text-sm text-[var(--app-text)]">
              <SurfaceCard className="px-4 py-3">
                <p className="text-xs font-bold uppercase text-[var(--app-muted)]">활성 플랜</p>
                <p className="mt-2 text-base font-semibold text-[var(--app-text)]">{activePlan}</p>
              </SurfaceCard>
              <SurfaceCard className="px-4 py-3">
                <p className="text-xs font-bold uppercase text-[var(--app-muted)]">남은 크레딧</p>
                <p className="mt-2 text-base font-semibold text-[var(--app-text)]">{credits.toLocaleString("ko-KR")}</p>
              </SurfaceCard>
              <SurfaceCard className="px-4 py-3">
                <p className="text-xs font-bold uppercase text-[var(--app-muted)]">생성 기준</p>
                <p className="mt-2 text-base font-semibold text-[var(--app-text)]">
                  헤어스타일 1회당 {creditsPerStyle} credits
                </p>
              </SurfaceCard>
            </div>
          </Card>

          <Card
            title="준비 상태"
            description="패션 추천 흐름에 필요한 조건을 빠르게 확인합니다."
            className=""
          >
            <div className="grid gap-3">
              <ChecklistItem label="바디 프로필 완성" ready={profileReady} />
              <ChecklistItem label="전신 사진 저장" ready={hasBodyPhoto} />
              <ChecklistItem label="헤어 생성 기록 보유" ready={hasGenerationHistory} />
            </div>
          </Card>
        </aside>
      </div>
    </AppPage>
  );
}
