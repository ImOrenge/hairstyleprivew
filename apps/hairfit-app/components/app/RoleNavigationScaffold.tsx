import { useAuth, useUser } from "@clerk/clerk-expo";
import { type Href, usePathname, useRouter } from "expo-router";
import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
import { customerColors } from "../../lib/customer-ui";

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
          style={[
            styles.safeFooter,
            role === "customer"
              ? styles.customerSafeFooter
              : { backgroundColor: theme.background, borderTopColor: theme.border },
          ]}
        >
          <View
            accessibilityLabel={`${getRoleNavigationLabel(role)} 주요 내비게이션`}
            accessibilityRole="tablist"
            style={styles.navigation}
          >
            {items.map((item) => {
              const selected = isRoleNavigationItemActive(pathname, item);

              if (role === "customer") {
                const action = item.href === "/consulting";
                return (
                  <Pressable
                    key={item.href}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      if (action) router.push(item.href as Href);
                      else if (!selected) router.replace(item.href as Href);
                    }}
                    style={({ pressed }) => [
                      styles.customerNavigationItem,
                      pressed ? styles.customerNavigationItemPressed : null,
                    ]}
                  >
                    <View style={action ? styles.customerActionIcon : styles.customerIcon}>
                      <Text style={action ? styles.customerActionIconLabel : styles.customerIconLabel}>
                        {action ? "+" : item.label.slice(0, 1)}
                      </Text>
                    </View>
                    <Text style={[styles.customerNavigationLabel, selected ? styles.customerNavigationLabelSelected : null]} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }

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
  customerSafeFooter: {
    backgroundColor: "rgba(17,17,15,0.98)",
    borderTopColor: customerColors.line,
  },
  customerNavigationItem: {
    alignItems: "center",
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minHeight: 54,
    minWidth: 0,
  },
  customerNavigationItemPressed: {
    opacity: 0.72,
  },
  customerIcon: {
    alignItems: "center",
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  customerIconLabel: {
    color: customerColors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  customerActionIcon: {
    alignItems: "center",
    backgroundColor: customerColors.champagne,
    borderColor: customerColors.canvas,
    borderRadius: 21,
    borderWidth: 4,
    height: 42,
    justifyContent: "center",
    marginTop: -18,
    width: 42,
  },
  customerActionIconLabel: {
    color: customerColors.canvas,
    fontSize: 23,
    fontWeight: "500",
    lineHeight: 25,
  },
  customerNavigationLabel: {
    color: customerColors.subtle,
    fontSize: 10,
    fontWeight: "700",
  },
  customerNavigationLabelSelected: {
    color: customerColors.ivory,
  },
});
