import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SupportPostForm } from "../../../components/support/SupportPostForm";
import { AppPage, Panel } from "../../../components/ui/Surface";
import { buildSignInRedirectUrl } from "../../../lib/clerk";

interface SupportNewPageProps {
  searchParams: Promise<{
    kind?: string;
  }>;
}

export const metadata: Metadata = {
  title: "고객지원 글쓰기",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SupportNewPage({ searchParams }: SupportNewPageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect(buildSignInRedirectUrl("/support/new"));
  }

  const params = await searchParams;

  return (
    <AppPage className="grid max-w-4xl gap-5 pb-16">
      <Link href="/support?tab=all" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--app-muted)] hover:text-[var(--app-text)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        고객지원센터로 돌아가기
      </Link>
      <Panel className="p-5 sm:p-6">
        <p className="app-kicker">New Support Post</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--app-text)]">게시글 작성</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
          작성한 글은 즉시 공개됩니다. 개인정보, 결제정보, 민감한 사진 설명은 포함하지 마세요.
        </p>
      </Panel>
      <SupportPostForm initialKind={params.kind} />
    </AppPage>
  );
}
