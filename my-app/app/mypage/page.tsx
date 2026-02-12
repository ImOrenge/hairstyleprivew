import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
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
    return "Free";
  }

  if (planKey === "starter") {
    return "Starter";
  }

  if (planKey === "pro") {
    return "Pro";
  }

  return planKey.charAt(0).toUpperCase() + planKey.slice(1);
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrompt(prompt: string | null | undefined): string {
  const value = prompt?.trim();
  if (!value) {
    return "Untitled generation";
  }

  if (value.length <= 80) {
    return value;
  }

  return `${value.slice(0, 80)}...`;
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
  }

  const credits = Number.isInteger(profile?.credits) ? Number(profile?.credits) : 0;
  const creditsPerStyle = getCreditsPerStyle();
  const estimatedStyles =
    creditsPerStyle > 0 ? Math.floor(credits / creditsPerStyle) : 0;
  const activePlan = formatPlanLabel(getPlanFromMetadata(latestPaidTx?.metadata));

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 px-6 py-8">
      <h1 className="text-2xl font-bold">My Page</h1>

      {payment === "success" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Payment was confirmed. Credits will be updated shortly.
          {checkoutId ? ` Checkout ID: ${checkoutId}` : ""}
        </div>
      ) : null}

      <Card title="Plan and Credits" description="Current plan and available credit balance">
        <div className="grid gap-2 text-sm text-stone-700">
          <p>
            Active plan: <strong className="text-base text-black">{activePlan}</strong>
          </p>
          <p>
            Remaining credits:{" "}
            <strong className="text-base text-black">{credits.toLocaleString()}</strong>
          </p>
          <p>
            Estimated generations:{" "}
            <strong className="text-base text-black">{estimatedStyles.toLocaleString()}</strong>
            {` `}({creditsPerStyle} credits per style)
          </p>
        </div>
      </Card>

      <Card title="Generation History" description="Latest generated results">
        <div className="grid gap-2 text-sm text-stone-700">
          {generations.length === 0 ? (
            <p className="rounded-lg border border-stone-200 px-3 py-2 text-stone-500">
              No generation history yet.
            </p>
          ) : (
            generations.map((item) => (
              <Link
                key={item.id}
                href={`/result/${item.id}`}
                className="rounded-lg border border-stone-200 px-3 py-2 hover:bg-stone-50"
              >
                <div className="font-medium text-stone-900">{formatPrompt(item.prompt_used)}</div>
                <div className="text-xs text-stone-500">
                  {item.id} | {item.status ?? "unknown"} | {formatDate(item.created_at)}
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
