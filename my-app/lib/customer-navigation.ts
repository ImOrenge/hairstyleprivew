export const CUSTOMER_NAVIGATION_ITEMS = [
  { href: "/home", label: "홈" },
  { href: "/stylebook", label: "스타일북" },
  { href: "/consulting/new", label: "새 컨설팅", action: true },
  { href: "/aftercare", label: "케어" },
  { href: "/mypage", label: "내 정보" },
] as const;

const customerShellRoutes = ["/home", "/stylebook", "/aftercare", "/mypage"] as const;
const customerShellHarnessRoutes = [
  "/e2e-harness/customer-shell",
  "/e2e-harness/customer-stylebook",
] as const;

export function isCustomerShellPath(pathname: string) {
  return customerShellHarnessRoutes.includes(pathname as (typeof customerShellHarnessRoutes)[number])
    || customerShellRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function isCustomerNavigationItemActive(pathname: string, href: string) {
  if (href.startsWith("/consulting")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
