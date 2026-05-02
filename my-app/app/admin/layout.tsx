import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminSectionNav } from "../../components/layout/AdminSectionNav";
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
    <div className="app-page flex flex-col gap-4 lg:flex-row lg:gap-5">
      <aside className="app-panel sticky top-20 hidden h-fit min-w-[210px] p-4 lg:block">
        <p className="app-kicker">Admin</p>
        <AdminSectionNav links={adminLinks} variant="rail" />
      </aside>
      <div className="min-w-0 flex-1">
        <AdminSectionNav links={adminLinks} variant="tabs" />
        {children}
      </div>
    </div>
  );
}
