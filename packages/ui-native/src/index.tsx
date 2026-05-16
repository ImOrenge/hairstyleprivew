import { createContext, type ReactNode } from "react";
import {
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

export function Screen({
  children,
  footerOverlay,
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
  screenWithFooterOverlay: {
    paddingBottom: 104,
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
  patternLine: {
    opacity: screenPattern.opacity,
    position: "absolute",
    width: screenPattern.lineWidth,
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
