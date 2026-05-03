import { createContext, useContext, useState, type ReactNode } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const colors = {
  background: "#f6f5f1",
  surface: "#ffffff",
  surfaceMuted: "#eceae3",
  surfaceRaised: "#fbfaf7",
  text: "#191816",
  muted: "#625f57",
  border: "#d4cfc4",
  borderStrong: "#191816",
  inverse: "#050505",
  inverseMuted: "#151412",
  inverseText: "#f4f1e8",
  accent: "#a8863a",
  accentStrong: "#80621e",
  accentSoft: "#eee4cf",
  success: "#117a4b",
  successSoft: "#e8f7ef",
  danger: "#b42318",
  dangerSoft: "#fff0ee",
};

export const darkColors: typeof colors = {
  background: "#050505",
  surface: "#101010",
  surfaceMuted: "#181818",
  surfaceRaised: "#141414",
  text: "#f4f1e8",
  muted: "#b6b0a3",
  border: "#34322c",
  borderStrong: "#f4f1e8",
  inverse: "#050505",
  inverseMuted: "#12110f",
  inverseText: "#f4f1e8",
  accent: "#d0b06a",
  accentStrong: "#e4ca8c",
  accentSoft: "#2a2418",
  success: "#74d69a",
  successSoft: "#10291c",
  danger: "#ff8a80",
  dangerSoft: "#321514",
};

export const radii = {
  panel: 6,
  control: 3,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
};

export function useThemeColors() {
  return darkColors;
}

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
  const count = Math.ceil((width + height) / 64) + 8;
  const lines = Array.from({ length: count }, (_, index) => index);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {lines.map((index) => (
        <View
          key={`a-${index}`}
          style={[
            styles.patternLine,
            {
              backgroundColor: "rgba(208, 176, 106, 0.14)",
              height: size,
              left: index * 64 - size / 2,
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
              backgroundColor: "rgba(168, 134, 58, 0.1)",
              height: size,
              left: index * 64 - size / 2,
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
            <Text style={[styles.brand, { color: theme.text }]}>HairFit</Text>
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
  showHeader = true,
  style,
}: {
  children: ReactNode;
  showHeader?: boolean;
  style?: ViewStyle;
}) {
  const theme = useThemeColors();

  return (
    <SafeAreaView edges={["top"]} style={[styles.screenFrame, { backgroundColor: theme.background }]}>
      <PatternLayer />
      {showHeader ? <AppHeader /> : null}
      <ScrollView contentContainerStyle={[styles.screen, style]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Stack({ children, gap = spacing.md, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useThemeColors();
  return <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useThemeColors();
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>{children}</View>;
}

export function Kicker({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const theme = useThemeColors();
  return <Text style={[styles.kicker, { color: theme.accent }, style]}>{children}</Text>;
}

export function Heading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const theme = useThemeColors();
  return <Text style={[styles.heading, { color: theme.text }, style]}>{children}</Text>;
}

export function BodyText({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const theme = useThemeColors();
  return <Text style={[styles.body, { color: theme.muted }, style]}>{children}</Text>;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  const theme = useThemeColors();
  return <Text style={[styles.fieldLabel, { color: theme.text }]}>{children}</Text>;
}

export function TextField({
  label,
  style,
  ...props
}: TextInputProps & { label?: ReactNode }) {
  const theme = useThemeColors();

  return (
    <View style={styles.field}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <TextInput
        placeholderTextColor={theme.muted}
        style={[
          styles.input,
          { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

export function Stat({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  const theme = useThemeColors();

  return (
    <View style={[styles.stat, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.muted }]}>{label}</Text>
    </View>
  );
}

export function MetricGrid({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.metricGrid, style]}>{children}</View>;
}

export function MetricTile({
  helper,
  label,
  value,
}: {
  helper?: ReactNode;
  label: ReactNode;
  value: ReactNode;
}) {
  const theme = useThemeColors();

  return (
    <View style={[styles.metricTile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.metricLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
      {helper ? <Text style={[styles.metricHelper, { color: theme.muted }]}>{helper}</Text> : null}
    </View>
  );
}

export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Cluster({
  children,
  gap = spacing.xs,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: ViewStyle;
}) {
  return <View style={[styles.cluster, { gap }, style]}>{children}</View>;
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "danger";
}) {
  const theme = useThemeColors();
  const backgroundColor =
    tone === "accent"
      ? theme.accentSoft
      : tone === "success"
        ? theme.successSoft
        : tone === "danger"
          ? theme.dangerSoft
          : theme.surfaceMuted;
  const color =
    tone === "accent"
      ? theme.accentStrong
      : tone === "success"
        ? theme.success
        : tone === "danger"
          ? theme.danger
          : theme.muted;

  return (
    <View style={[styles.chip, { backgroundColor, borderColor: theme.border }]}>
      <Text style={[styles.chipText, { color }]}>{children}</Text>
    </View>
  );
}

export function Divider() {
  const theme = useThemeColors();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

export function Button({
  children,
  disabled,
  onPress,
  variant = "primary",
}: {
  children: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const theme = useThemeColors();
  const secondary = variant === "secondary" || variant === "ghost";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.inverse, borderColor: theme.inverse },
        variant === "secondary" ? { backgroundColor: theme.surface, borderColor: theme.border } : null,
        variant === "ghost" ? { backgroundColor: "transparent", borderColor: "transparent" } : null,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: theme.inverseText },
          secondary ? { color: theme.text } : null,
          disabled ? { color: theme.muted } : null,
        ]}
      >
        {children}
      </Text>
    </Pressable>
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
  brand: {
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28,
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
    opacity: 0.58,
    position: "absolute",
    width: StyleSheet.hairlineWidth,
  },
  panel: {
    borderRadius: radii.panel,
    borderWidth: 1,
    padding: 20,
  },
  card: {
    borderRadius: radii.panel,
    borderWidth: 1,
    padding: spacing.md,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  heading: {
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 36,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  cluster: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    alignSelf: "flex-start",
    borderRadius: radii.panel,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  divider: {
    height: 1,
    width: "100%",
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  input: {
    borderRadius: radii.control,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  stat: {
    borderRadius: radii.panel,
    borderWidth: 1,
    padding: spacing.md,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  metricTile: {
    borderRadius: radii.panel,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 142,
    padding: 16,
    width: "47%",
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
    marginTop: spacing.xs,
  },
  metricHelper: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  button: {
    alignItems: "center",
    borderRadius: radii.control,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "800",
  },
});
