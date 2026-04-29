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
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 sm:px-6">
      <aside className="sticky top-24 hidden h-fit min-w-[210px] rounded-2xl border border-stone-200 bg-white p-4 lg:block">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">Admin</p>
        <nav className="mt-4 grid gap-1.5">
          {adminLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border border-transparent px-3 py-2 text-sm font-semibold text-stone-700 hover:border-stone-200 hover:bg-stone-50"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <nav className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 bg-white p-3 lg:hidden">
          {adminLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg border border-stone-200 px-3 py-2 text-center text-sm font-semibold text-stone-700"
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
