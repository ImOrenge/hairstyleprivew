import type { MobileBootstrap } from "@hairfit/shared";

export type HairfitAccountType = NonNullable<MobileBootstrap["accountType"]>;
export type RoleNavigationRole = "customer" | "salon" | "admin";

export interface RoleNavigationItem {
  activePaths: readonly string[];
  exact?: boolean;
  href: string;
  label: string;
}

const customerItems: readonly RoleNavigationItem[] = [
  { activePaths: ["/"], exact: true, href: "/", label: "홈" },
  { activePaths: ["/upload", "/workspace"], href: "/upload", label: "생성" },
  { activePaths: ["/mypage"], href: "/mypage", label: "기록" },
  { activePaths: ["/account"], href: "/account", label: "계정" },
];

const salonItems: readonly RoleNavigationItem[] = [
  { activePaths: ["/salon/customers"], href: "/salon/customers", label: "고객" },
  { activePaths: ["/salon"], exact: true, href: "/salon", label: "대시보드" },
  { activePaths: ["/account"], href: "/account", label: "계정" },
];

const adminItems: readonly RoleNavigationItem[] = [
  { activePaths: ["/admin/stats"], href: "/admin/stats", label: "통계" },
  { activePaths: ["/admin/members"], href: "/admin/members", label: "회원" },
  { activePaths: ["/admin/reviews", "/admin/inbox", "/admin/b2b"], href: "/admin/reviews", label: "운영" },
  { activePaths: ["/account"], href: "/account", label: "계정" },
];

const navigationHiddenPrefixes = [
  "/login",
  "/signup",
  "/sso-callback",
  "/upload",
  "/workspace",
  "/generate",
  "/result",
  "/styler",
  "/billing",
  "/payments",
  "/personal-color",
  "/aftercare",
  "/salon/match",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pathMatches(pathname: string, candidate: string, exact = false) {
  return exact ? pathname === candidate : pathname === candidate || pathname.startsWith(`${candidate}/`);
}

export function normalizeAccountType(value: unknown): HairfitAccountType | null {
  if (value === "member" || value === "salon_owner" || value === "admin") {
    return value;
  }

  return null;
}

export function readAccountTypeMetadata(source: unknown) {
  const record = asRecord(source);
  if (!record) return null;

  const nestedSources = [
    record,
    asRecord(record.metadata),
    asRecord(record.publicMetadata),
    asRecord(record.public_metadata),
  ];

  for (const nested of nestedSources) {
    const accountType = normalizeAccountType(nested?.accountType);
    if (accountType) return accountType;
  }

  return null;
}

export function resolveRoleNavigationRole(
  accountType: MobileBootstrap["accountType"],
  pathname: string,
): RoleNavigationRole {
  if (accountType === "admin") return "admin";
  if (accountType === "salon_owner") return "salon";
  if (accountType === "member") return "customer";
  if (pathMatches(pathname, "/admin")) return "admin";
  if (pathname !== "/salon/connections" && pathMatches(pathname, "/salon/customers")) return "salon";
  if (pathname === "/salon") return "salon";
  return "customer";
}

export function getRoleNavigationItems(role: RoleNavigationRole) {
  if (role === "admin") return adminItems;
  if (role === "salon") return salonItems;
  return customerItems;
}

export function getRoleHomeRoute(role: RoleNavigationRole) {
  if (role === "admin") return "/admin/stats";
  if (role === "salon") return "/salon/customers";
  return "/";
}

export function getRoleNavigationLabel(role: RoleNavigationRole) {
  if (role === "admin") return "관리자";
  if (role === "salon") return "살롱";
  return "고객";
}

export function isRoleNavigationHidden(pathname: string) {
  return navigationHiddenPrefixes.some((prefix) => pathMatches(pathname, prefix));
}

export function isRoleNavigationItemActive(pathname: string, item: RoleNavigationItem) {
  return item.activePaths.some((candidate) => pathMatches(pathname, candidate, item.exact));
}
