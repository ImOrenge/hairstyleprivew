import { auth } from "@clerk/nextjs/server";
import type { CustomerStylebookViewV2 } from "@hairfit/shared";
import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerPageHeader, CustomerShell } from "../../components/customer/CustomerShell";
import { CustomerStylebookCollection } from "../../components/customer/CustomerStylebookCollection";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { loadCustomerStylebookCollectionV2 } from "../../lib/v2/customer-history-server";

export default async function StylebookPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect(buildSignInRedirectUrl("/stylebook"));

  const { view } = await searchParams;
  const activeView: CustomerStylebookViewV2 = view === "fashion" ? "fashion" : "hair";
  const collection = await loadCustomerStylebookCollectionV2(userId);

  return (
    <CustomerShell>
      <div className="customer-page">
        <CustomerPageHeader
          eyebrow="Stylebook"
          title="나의 스타일북"
          description="컨설팅에서 최종 확정한 헤어와 패션 룩을 모아, 완성된 리포트로 다시 확인하세요."
          action={
            <Link href="/consulting/new" className="customer-primary-button">
              <Plus aria-hidden="true" />
              새 컨설팅
            </Link>
          }
        />

        <CustomerStylebookCollection collection={collection} activeView={activeView} />
      </div>
    </CustomerShell>
  );
}
