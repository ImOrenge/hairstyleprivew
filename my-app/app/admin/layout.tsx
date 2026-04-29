import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminPageAccess } from "../../lib/admin-auth";

interface AdminLayoutProps {
  children: ReactNode;
}

const adminLinks = [
  { href: "/admin/members", label: "회원관리" },
  { href: "/admin/b2b", label: "B2B" },
  { href: "/admin/inbox", label: "Inbox" },
  { href: "/admin/reviews", label: "리뷰관리" },
  { href: "/admin/stats", label: "통계" },
];

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const access = await requireAdminPageAccess("/admin/stats");
  if (!access.ok) {
    redirect(access.redirectTo);
  }

  return (
    <div className="app-page flex gap-5">
      <aside className="app-panel sticky top-20 hidden h-fit min-w-[210px] p-4 lg:block">
        <p className="app-kicker">Admin</p>
        <nav className="mt-4 grid gap-1.5">
          {adminLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[var(--app-radius-control)] border border-transparent px-3 py-2 text-sm font-semibold text-[var(--app-text)] hover:border-[var(--app-border)] hover:bg-[var(--app-surface-muted)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <nav className="app-panel mb-4 grid grid-cols-2 gap-2 p-3 lg:hidden">
          {adminLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-3 py-2 text-center text-sm font-semibold text-[var(--app-text)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
