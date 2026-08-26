export const CUSTOMER_NAVIGATION_ITEMS = [
  { href: "/home", label: "홈" },
  { href: "/stylebook", label: "스타일북" },
  { href: "/consulting/new", label: "새 컨설팅", action: true },
  { href: "/aftercare", label: "케어" },
  { href: "/mypage", label: "내 정보" },
] as const;

const customerShellRoutes = ["/home", "/stylebook", "/aftercare", "/mypage"] as const;
const customerShellHarnessRoute = "/e2e-harness/customer-shell";

export function isCustomerShellPath(pathname: string) {
  return pathname === customerShellHarnessRoute
    || customerShellRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function isCustomerNavigationItemActive(pathname: string, href: string) {
  if (href.startsWith("/consulting")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
