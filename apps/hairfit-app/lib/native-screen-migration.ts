export type NativeScreenMigrationGroup =
  | "route-alias"
  | "short-scroll"
  | "form"
  | "virtualized-list"
  | "complex-flow";

export type NativeScreenTargetShell =
  | "RouteAlias"
  | "AppScreen"
  | "FormScreen"
  | "VirtualizedListScreen";

export type NativeScreenMigrationState = "alias" | "compatibility" | "migrated";

export interface NativeScreenMigrationEntry {
  file: string;
  group: NativeScreenMigrationGroup;
  targetShell: NativeScreenTargetShell;
  state: NativeScreenMigrationState;
  rollbackExport: "Screen" | "FormScreen" | "VirtualizedListScreen" | null;
  shellOwner: string;
}

function entry(
  file: string,
  group: NativeScreenMigrationGroup,
  targetShell: NativeScreenTargetShell,
  state: NativeScreenMigrationState,
  rollbackExport: NativeScreenMigrationEntry["rollbackExport"],
  shellOwner = file,
): NativeScreenMigrationEntry {
  return { file, group, targetShell, state, rollbackExport, shellOwner };
}

export const NATIVE_SCREEN_MIGRATION_MAP: NativeScreenMigrationEntry[] = [
  entry("app/(auth)/forgot-password.tsx", "form", "FormScreen", "migrated", "FormScreen"),
  entry("app/(auth)/login.tsx", "form", "FormScreen", "migrated", "FormScreen"),
  entry("app/(auth)/signup.tsx", "form", "FormScreen", "migrated", "FormScreen"),
  entry("app/account.tsx", "short-scroll", "AppScreen", "migrated", "Screen"),
  entry("app/admin/b2b.tsx", "virtualized-list", "VirtualizedListScreen", "migrated", "VirtualizedListScreen"),
  entry("app/admin/inbox.tsx", "virtualized-list", "VirtualizedListScreen", "migrated", "VirtualizedListScreen"),
  entry("app/admin/index.tsx", "short-scroll", "AppScreen", "migrated", "Screen"),
  entry("app/admin/members.tsx", "virtualized-list", "VirtualizedListScreen", "migrated", "VirtualizedListScreen"),
  entry("app/admin/members/[userId].tsx", "short-scroll", "AppScreen", "migrated", "Screen"),
  entry("app/admin/reviews.tsx", "virtualized-list", "VirtualizedListScreen", "migrated", "VirtualizedListScreen"),
  entry("app/admin/stats.tsx", "short-scroll", "AppScreen", "migrated", "Screen"),
  entry("app/aftercare.tsx", "short-scroll", "AppScreen", "compatibility", "Screen"),
  entry("app/aftercare/[hairRecordId].tsx", "complex-flow", "AppScreen", "compatibility", "Screen"),
  entry("app/billing.tsx", "complex-flow", "AppScreen", "migrated", "Screen"),
  entry("app/generate.tsx", "complex-flow", "AppScreen", "migrated", "Screen"),
  entry("app/generate/[id].tsx", "complex-flow", "AppScreen", "migrated", "Screen"),
  entry("app/home.tsx", "route-alias", "RouteAlias", "alias", null),
  entry("app/index.tsx", "short-scroll", "AppScreen", "migrated", "Screen"),
  entry("app/legal/privacy.tsx", "short-scroll", "AppScreen", "migrated", "Screen"),
  entry("app/legal/terms.tsx", "short-scroll", "AppScreen", "migrated", "Screen"),
  entry("app/mypage.tsx", "complex-flow", "AppScreen", "migrated", "Screen"),
  entry("app/payments/complete.tsx", "complex-flow", "AppScreen", "migrated", "Screen"),
  entry("app/personal-color.tsx", "complex-flow", "AppScreen", "migrated", "Screen"),
  entry("app/privacy-policy.tsx", "route-alias", "RouteAlias", "alias", null),
  entry("app/result/[id].tsx", "complex-flow", "AppScreen", "migrated", "Screen"),
  entry("app/salon/connections.tsx", "short-scroll", "AppScreen", "migrated", "Screen"),
  entry("app/salon/customers/[id].tsx", "complex-flow", "AppScreen", "migrated", "Screen"),
  entry("app/salon/customers/index.tsx", "virtualized-list", "VirtualizedListScreen", "migrated", "VirtualizedListScreen"),
  entry("app/salon/index.tsx", "short-scroll", "AppScreen", "migrated", "Screen"),
  entry("app/salon/match/[code].tsx", "complex-flow", "AppScreen", "migrated", "Screen"),
  entry("app/sso-callback.tsx", "complex-flow", "AppScreen", "migrated", "Screen"),
  entry(
    "app/styler/[id].tsx",
    "complex-flow",
    "AppScreen",
    "migrated",
    "Screen",
    "components/styler/MobileStylerSessionView.tsx",
  ),
  entry(
    "app/styler/new.tsx",
    "complex-flow",
    "AppScreen",
    "migrated",
    "Screen",
    "components/styler/MobileStylerNewView.tsx",
  ),
  entry("app/terms-of-service.tsx", "route-alias", "RouteAlias", "alias", null),
  entry("app/upload.tsx", "complex-flow", "AppScreen", "migrated", "Screen"),
  entry("app/workspace.tsx", "route-alias", "RouteAlias", "alias", null),
];

export function getNativeScreenMigrationSummary() {
  return NATIVE_SCREEN_MIGRATION_MAP.reduce(
    (summary, item) => {
      summary[item.state] += 1;
      return summary;
    },
    { alias: 0, compatibility: 0, migrated: 0 },
  );
}
