import { createContext, useContext, useState, type ReactNode } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radii, spacing, useThemeColors } from "../../../packages/ui-native/src/index";

export * from "../../../packages/ui-native/src/index";

export interface HeaderMenuItem {
  label: string;
  path: string;
}

interface HeaderNavigationValue {
  brandPath: string;
  isSignedIn: boolean;
  menuItems: HeaderMenuItem[];
  onSignOut?: () => void;
}

const defaultHeaderNavigation: HeaderNavigationValue = {
  brandPath: "/",
  isSignedIn: false,
  menuItems: [{ label: "회원가입", path: "/signup" }],
};

const HeaderNavigationContext = createContext<HeaderNavigationValue>(defaultHeaderNavigation);

const screenPattern = {
  lineAlt: "rgba(168, 134, 58, 0.18)",
  linePrimary: "rgba(208, 176, 106, 0.24)",
  lineWidth: 1.3,
  opacity: 0.58,
  tileSize: 64,
} as const;

export function HeaderNavigationProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: HeaderNavigationValue;
}) {
  return <HeaderNavigationContext.Provider value={value}>{children}</HeaderNavigationContext.Provider>;
}

function PatternLayer() {
  const { height, width } = useWindowDimensions();
  const size = Math.max(width, height) * 1.7;
  const count = Math.ceil((width + height) / screenPattern.tileSize) + 8;
  const lines = Array.from({ length: count }, (_, index) => index);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {lines.map((index) => (
        <View
          key={`a-${index}`}
          style={[
            styles.patternLine,
            {
              backgroundColor: screenPattern.linePrimary,
              height: size,
              left: index * screenPattern.tileSize - size / 2,
              top: -height * 0.28,
              transform: [{ rotate: "45deg" }],
            },
          ]}
        />
      ))}
      {lines.map((index) => (
        <View
          key={`b-${index}`}
          style={[
            styles.patternLine,
            {
              backgroundColor: screenPattern.lineAlt,
              height: size,
              left: index * screenPattern.tileSize - size / 2,
              top: -height * 0.28,
              transform: [{ rotate: "-45deg" }],
            },
          ]}
        />
      ))}
    </View>
  );
}

function MenuIcon() {
  return (
    <View style={styles.menuIcon}>
      <View style={styles.menuLine} />
      <View style={styles.menuLine} />
      <View style={styles.menuLine} />
    </View>
  );
}

function navigatePath(path: string) {
  if (typeof window !== "undefined" && window.location) {
    window.location.assign(path);
    return;
  }

  const normalized = path.replace(/^\/+/, "");
  void Linking.openURL(`hairfit://${normalized}`).catch(() => undefined);
}

function HeaderMenuLink({ label, path }: { label: string; path: string }) {
  const theme = useThemeColors();

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => navigatePath(path)}
      style={({ pressed }) => [
        styles.headerMenuLink,
        { borderColor: theme.border },
        pressed ? styles.buttonPressed : null,
      ]}
    >
      <Text style={[styles.headerMenuLinkText, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function AppHeader() {
  const theme = useThemeColors();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerNavigation = useContext(HeaderNavigationContext);

  return (
    <View style={[styles.headerShell, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="link" onPress={() => navigatePath(headerNavigation.brandPath)} style={styles.brandButton}>
          <View style={styles.brandLockup}>
            <Text style={[styles.brand, { color: theme.text }]}>HairFit</Text>
            <Text style={[styles.brandPath, { color: theme.muted }]}>/dashbord</Text>
          </View>
        </Pressable>
        <View style={styles.headerActions}>
          {headerNavigation.isSignedIn ? (
            <Pressable
              accessibilityRole="button"
              onPress={headerNavigation.onSignOut ?? (() => navigatePath("/login"))}
              style={({ pressed }) => [
                styles.headerButton,
                { borderColor: theme.borderStrong },
                pressed ? styles.buttonPressed : null,
              ]}
            >
              <Text style={[styles.headerButtonText, { color: theme.text }]}>로그아웃</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="link"
              onPress={() => navigatePath("/login")}
              style={({ pressed }) => [
                styles.headerButton,
                { borderColor: theme.borderStrong },
                pressed ? styles.buttonPressed : null,
              ]}
            >
              <Text style={[styles.headerButtonText, { color: theme.text }]}>로그인</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityLabel="메뉴 열기"
            accessibilityRole="button"
            accessibilityState={{ expanded: menuOpen }}
            onPress={() => setMenuOpen((current) => !current)}
            style={({ pressed }) => [
              styles.headerIconButton,
              { borderColor: theme.border },
              pressed ? styles.buttonPressed : null,
            ]}
          >
            <MenuIcon />
          </Pressable>
        </View>
      </View>
      {menuOpen ? (
        <View style={[styles.headerMenu, { borderTopColor: theme.border }]}>
          {headerNavigation.menuItems.map((item) => (
            <HeaderMenuLink key={item.path} label={item.label} path={item.path} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function Screen({
  children,
  footerOverlay,
  showHeader = true,
  style,
}: {
  children: ReactNode;
  footerOverlay?: ReactNode;
  showHeader?: boolean;
  style?: ViewStyle;
}) {
  const theme = useThemeColors();

  return (
    <SafeAreaView edges={["top"]} style={[styles.screenFrame, { backgroundColor: theme.background }]}>
      <PatternLayer />
      {showHeader ? <AppHeader /> : null}
      <ScrollView
        contentContainerStyle={[styles.screen, footerOverlay ? styles.screenWithFooterOverlay : null, style]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footerOverlay ? (
        <View style={[styles.footerOverlay, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
          {footerOverlay}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenFrame: {
    flex: 1,
    minHeight: "100%",
  },
  screen: {
    gap: spacing.md,
    minHeight: "100%",
    padding: 8,
    paddingBottom: spacing.xl,
  },
  screenWithFooterOverlay: {
    paddingBottom: 104,
  },
  headerShell: {
    borderBottomWidth: 1,
    zIndex: 2,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  brandButton: {
    paddingVertical: 4,
  },
  brandLockup: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 6,
  },
  brand: {
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28,
  },
  brandPath: {
    fontSize: 13,
    fontWeight: "800",
  },
  footerOverlay: {
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: 8,
    position: "absolute",
    right: 0,
    zIndex: 4,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  headerButton: {
    alignItems: "center",
    borderRadius: radii.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12,
  },
  headerButtonText: {
    fontSize: 13,
    fontWeight: "900",
  },
  headerIconButton: {
    alignItems: "center",
    borderRadius: radii.control,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  headerMenu: {
    borderTopWidth: 1,
    gap: 6,
    padding: 8,
  },
  headerMenuLink: {
    borderRadius: radii.control,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerMenuLinkText: {
    fontSize: 14,
    fontWeight: "800",
  },
  menuIcon: {
    gap: 4,
    width: 15,
  },
  menuLine: {
    backgroundColor: "#f4f1e8",
    height: 2,
    width: "100%",
  },
  patternLine: {
    opacity: screenPattern.opacity,
    position: "absolute",
    width: screenPattern.lineWidth,
  },
  buttonPressed: {
    opacity: 0.72,
  },
});
