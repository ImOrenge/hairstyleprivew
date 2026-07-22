import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UsagePackPaymentReturn } from "../../../../components/payments/UsagePackPaymentReturn";
import { AppPage, Panel } from "../../../../components/ui/Surface";
import { buildSignInRedirectUrl } from "../../../../lib/clerk";

type SearchParams = Record<string, string | string[] | undefined>;

function readSearchParam(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function UsagePackCompletePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const paymentId = readSearchParam(params, "paymentId").trim();
  const { userId } = await auth();

  if (!userId) {
    const returnTo = `/billing/usage/complete?paymentId=${encodeURIComponent(paymentId)}`;
    redirect(buildSignInRedirectUrl(returnTo));
  }
  if (!paymentId) {
    redirect("/mypage?tab=plan");
  }

  return (
    <AppPage className="pb-16">
      <Panel as="section" className="mx-auto grid max-w-xl gap-4 p-5 sm:p-6">
        <p className="app-kicker">Payment confirmation</p>
        <h1 className="text-2xl font-black text-[var(--app-text)]">추가 이용권 결제 확인</h1>
        <UsagePackPaymentReturn paymentId={paymentId} />
      </Panel>
    </AppPage>
  );
}
