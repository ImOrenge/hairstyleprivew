import { useAuth, useUser } from "@clerk/clerk-expo";
import { type Href, usePathname, useRouter } from "expo-router";
import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, spacing, useThemeColors } from "@hairfit/ui-native/primitives";
import {
  getRoleNavigationItems,
  getRoleNavigationLabel,
  isRoleNavigationHidden,
  isRoleNavigationItemActive,
  normalizeAccountType,
  readAccountTypeMetadata,
  resolveRoleNavigationRole,
} from "../../lib/role-navigation";

export interface RoleNavigationScaffoldProps {
  children: ReactNode;
}

export function RoleNavigationScaffold({ children }: RoleNavigationScaffoldProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded, isSignedIn, sessionClaims } = useAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const theme = useThemeColors();
  const accountType =
    normalizeAccountType(user?.publicMetadata?.accountType) ?? readAccountTypeMetadata(sessionClaims);
  const role = resolveRoleNavigationRole(accountType, pathname);
  const items = getRoleNavigationItems(role);
  const roleIsKnown = accountType !== null || (pathname !== "/" && pathname !== "/account");
  const showNavigation =
    isLoaded && isUserLoaded && isSignedIn && roleIsKnown && !isRoleNavigationHidden(pathname);

  return (
    <View style={styles.frame}>
      <View style={styles.content}>{children}</View>
      {showNavigation ? (
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.safeFooter, { backgroundColor: theme.background, borderTopColor: theme.border }]}
        >
          <View
            accessibilityLabel={`${getRoleNavigationLabel(role)} 주요 내비게이션`}
            accessibilityRole="tablist"
            style={styles.navigation}
          >
            {items.map((item) => {
              const selected = isRoleNavigationItemActive(pathname, item);

              return (
                <Button
                  key={item.href}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  style={styles.navigationItem}
                  variant={selected ? "primary" : "ghost"}
                  onPress={() => {
                    if (!selected) router.replace(item.href as Href);
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  safeFooter: {
    borderTopWidth: 1,
  },
  navigation: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  navigationItem: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
  },
});
