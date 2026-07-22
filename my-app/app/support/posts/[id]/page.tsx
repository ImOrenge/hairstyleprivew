import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SupportPostOwnerActions } from "../../../../components/support/SupportPostOwnerActions";
import { AppPage, Panel } from "../../../../components/ui/Surface";
import { loadPublicSupportPostDetail } from "../../../../lib/support-server";
import {
  SUPPORT_POST_KIND_LABELS,
  SUPPORT_POST_STATUS_CLASS_NAMES,
  SUPPORT_POST_STATUS_LABELS,
} from "../../../../lib/support-types";

interface SupportPostPageProps {
  params: Promise<{
    id: string;
  }>;
}

export const metadata: Metadata = {
  title: "고객지원 게시글",
  robots: {
    index: false,
    follow: true,
  },
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SupportPostPage({ params }: SupportPostPageProps) {
  const resolvedParams = await params;
  const { userId } = await auth();
  const post = await loadPublicSupportPostDetail(resolvedParams.id, userId);
  if (!post) {
    notFound();
  }

  const canManage = Boolean(userId && userId === post.authorUserId);

  return (
    <AppPage className="grid max-w-4xl gap-5 pb-16">
      <Link href={`/support?tab=${post.kind}`} className="inline-flex items-center gap-2 text-sm font-bold text-[var(--app-muted)] hover:text-[var(--app-text)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        목록으로 돌아가기
      </Link>

      <Panel as="article" className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] px-2.5 py-1 text-xs font-black text-[var(--app-text)]">
            {SUPPORT_POST_KIND_LABELS[post.kind]}
          </span>
          <span className={`rounded-[var(--app-radius-control)] px-2.5 py-1 text-xs font-black ${SUPPORT_POST_STATUS_CLASS_NAMES[post.status]}`}>
            {SUPPORT_POST_STATUS_LABELS[post.status]}
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-[var(--app-text)]">{post.title}</h1>
        <p className="mt-3 text-sm text-[var(--app-muted)]">
          {post.authorDisplayName} · 작성 {formatDate(post.createdAt)} · 수정 {formatDate(post.updatedAt)}
        </p>
        <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-[var(--app-text)]">{post.body}</div>

        {canManage ? <SupportPostOwnerActions postId={post.id} title={post.title} body={post.body} /> : null}
      </Panel>

      <Panel as="section" className="p-5 sm:p-6">
        <p className="app-kicker">공식 답변</p>
        <h2 className="mt-2 text-xl font-black text-[var(--app-text)]">관리자 답변</h2>
        {post.adminAnswer ? (
          <>
            <p className="mt-2 text-xs font-semibold text-[var(--app-muted)]">{formatDate(post.adminAnsweredAt)}</p>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--app-text)]">{post.adminAnswer}</p>
          </>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[var(--app-muted)]">아직 관리자 답변이 없습니다.</p>
        )}
      </Panel>
    </AppPage>
  );
}
