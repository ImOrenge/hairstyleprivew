import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowRight, MessageSquarePlus, Search } from "lucide-react";
import { AppPage, Panel, SurfaceCard } from "../../components/ui/Surface";
import { buildSignInRedirectUrl } from "../../lib/clerk";
import { loadPublishedSupportFaqs, loadPublicSupportPosts } from "../../lib/support-server";
import {
  SUPPORT_POST_KIND_LABELS,
  SUPPORT_POST_STATUS_CLASS_NAMES,
  SUPPORT_POST_STATUS_LABELS,
  SUPPORT_PUBLIC_TAB_LABELS,
  SUPPORT_PUBLIC_TABS,
  isSupportPostKind,
  normalizeSupportPublicTab,
} from "../../lib/support-types";

interface SupportPageProps {
  searchParams: Promise<{
    q?: string;
    tab?: string;
  }>;
}

export const metadata: Metadata = {
  title: "고객지원센터",
  description: "HairFit FAQ, 리뷰/불만, 요구사항, 건의사항, 버그 제보를 확인하고 남길 수 있는 공개 고객지원센터입니다.",
  alternates: {
    canonical: "/support",
  },
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

export default async function SupportPage({ searchParams }: SupportPageProps) {
  const params = await searchParams;
  const tab = normalizeSupportPublicTab(params.tab);
  const q = (params.q || "").trim().slice(0, 100);
  const { userId } = await auth();
  const writeHref = userId
    ? `/support/new${isSupportPostKind(tab) ? `?kind=${tab}` : ""}`
    : buildSignInRedirectUrl(`/support/new${isSupportPostKind(tab) ? `?kind=${tab}` : ""}`);
  const faqs = tab === "faq" ? await loadPublishedSupportFaqs() : [];
  const posts =
    tab === "faq"
      ? []
      : await loadPublicSupportPosts({
          kind: isSupportPostKind(tab) ? tab : "all",
          q,
          limit: 80,
        });

  return (
    <AppPage className="grid gap-5 pb-16">
      <Panel as="section" className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="app-kicker">Support Center</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-[var(--app-text)] sm:text-4xl">
              고객지원센터
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--app-muted)] sm:text-base">
              FAQ를 확인하고, 리뷰/불만, 요구사항, 건의사항, 버그 제보를 공개 게시판에 남길 수 있습니다.
            </p>
          </div>
          <Link
            href={writeHref}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border-strong)] bg-[var(--app-inverse)] px-5 text-sm font-bold uppercase tracking-[0.04em] !text-[var(--app-inverse-text)] transition hover:bg-[var(--app-inverse-muted)]"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            글쓰기
          </Link>
        </div>
      </Panel>

      <nav className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="고객지원센터 게시판">
        {SUPPORT_PUBLIC_TABS.map((item) => {
          const active = tab === item;
          const href = `/support?tab=${item}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

          return (
            <Link
              key={item}
              href={href}
              className={`flex h-10 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] border px-4 text-sm font-black transition ${
                active
                  ? "border-[var(--app-border-strong)] bg-[var(--app-inverse)] text-[var(--app-inverse-text)]"
                  : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:bg-[var(--app-surface-muted)]"
              }`}
            >
              {SUPPORT_PUBLIC_TAB_LABELS[item]}
            </Link>
          );
        })}
      </nav>

      {tab !== "faq" ? (
        <form action="/support" className="grid gap-2 sm:grid-cols-[1fr_120px]">
          <input type="hidden" name="tab" value={tab} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" aria-hidden="true" />
            <input
              name="q"
              defaultValue={q}
              placeholder="제목, 내용, 작성자 검색"
              className="app-input h-11 w-full pl-9 pr-3 text-sm"
            />
          </div>
          <button className="h-11 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-4 text-sm font-black text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-muted)]">
            검색
          </button>
        </form>
      ) : null}

      {tab === "faq" ? (
        <section className="grid gap-3">
          {faqs.map((faq) => (
            <SurfaceCard as="details" key={faq.id} className="group p-4 open:bg-[var(--app-surface)]">
              <summary className="cursor-pointer list-none text-base font-black text-[var(--app-text)]">
                {faq.question}
              </summary>
              <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">{faq.answer}</p>
            </SurfaceCard>
          ))}
        </section>
      ) : (
        <section className="grid gap-3">
          {posts.length === 0 ? (
            <Panel className="p-8 text-center text-sm text-[var(--app-muted)]">아직 공개 게시글이 없습니다.</Panel>
          ) : null}
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/support/posts/${post.id}`}
              className="app-card grid gap-3 p-4 transition hover:-translate-y-0.5 hover:border-[var(--app-border-strong)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] px-2.5 py-1 text-xs font-black text-[var(--app-text)]">
                  {SUPPORT_POST_KIND_LABELS[post.kind]}
                </span>
                <span className={`rounded-[var(--app-radius-control)] px-2.5 py-1 text-xs font-black ${SUPPORT_POST_STATUS_CLASS_NAMES[post.status]}`}>
                  {SUPPORT_POST_STATUS_LABELS[post.status]}
                </span>
                <span className="text-xs font-semibold text-[var(--app-muted)]">
                  {post.authorDisplayName} · {formatDate(post.createdAt)}
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="line-clamp-1 text-lg font-black text-[var(--app-text)]">{post.title}</h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--app-muted)]">{post.bodyPreview}</p>
              </div>
              {post.adminAnswer ? (
                <p className="inline-flex items-center gap-2 text-xs font-black text-emerald-700">
                  관리자 답변 완료
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </p>
              ) : null}
            </Link>
          ))}
        </section>
      )}
    </AppPage>
  );
}
