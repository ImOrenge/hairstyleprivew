import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requirePageAccess } from "../../lib/rbac-server";

export default async function SalonLayout({ children }: { children: ReactNode }) {
  const access = await requirePageAccess("salon:read", "/salon/customers");
  if (!access.ok) {
    redirect(access.redirectTo);
  }

  return children;
}
