import { forwardRef, useId, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  type PressableProps,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

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

const LARGE_TEXT_STACK_THRESHOLD = 1.5;
const COMPACT_SCREEN_WIDTH = 360;

export function shouldStackDenseNativeLayout(fontScale: number, width: number) {
  return fontScale >= LARGE_TEXT_STACK_THRESHOLD || width < COMPACT_SCREEN_WIDTH;
}

export function useThemeColors() {
  return darkColors;
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
  return <Text allowFontScaling style={[styles.kicker, { color: theme.accent }, style]}>{children}</Text>;
}

export function Heading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const theme = useThemeColors();
  return <Text allowFontScaling style={[styles.heading, { color: theme.text }, style]}>{children}</Text>;
}

export function BodyText({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const theme = useThemeColors();
  return <Text allowFontScaling style={[styles.body, { color: theme.muted }, style]}>{children}</Text>;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  const theme = useThemeColors();
  return <Text allowFontScaling style={[styles.fieldLabel, { color: theme.text }]}>{children}</Text>;
}

export interface TextFieldProps extends TextInputProps {
  error?: ReactNode;
  helper?: ReactNode;
  label?: ReactNode;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField({
  allowFontScaling = true,
  accessibilityHint,
  accessibilityLabel,
  accessibilityState,
  editable = true,
  error,
  helper,
  label,
  style,
  ...props
}, ref) {
  const theme = useThemeColors();
  const inputId = useId();
  const labelText = typeof label === "string" ? label : undefined;
  const invalid = Boolean(error);
  const description = error ?? helper;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const descriptionText = typeof description === "string" ? description : undefined;

  return (
    <View style={styles.field}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <TextInput
        allowFontScaling={allowFontScaling}
        accessibilityHint={accessibilityHint ?? descriptionText}
        accessibilityLabel={accessibilityLabel ?? labelText}
        accessibilityState={{ ...accessibilityState, disabled: !editable }}
        aria-describedby={descriptionId}
        aria-errormessage={invalid ? descriptionId : undefined}
        aria-invalid={invalid}
        editable={editable}
        nativeID={inputId}
        placeholderTextColor={theme.muted}
        ref={ref}
        style={[
          styles.input,
          {
            backgroundColor: theme.surface,
            borderColor: invalid ? theme.danger : theme.border,
            color: theme.text,
            opacity: editable ? 1 : 0.55,
          },
          style,
        ]}
        {...props}
      />
      {error ? (
        <Text
          allowFontScaling
          accessibilityLiveRegion="polite"
          nativeID={descriptionId}
          style={[styles.fieldMessage, { color: theme.danger }]}
        >
          {error}
        </Text>
      ) : helper ? (
        <Text allowFontScaling nativeID={descriptionId} style={[styles.fieldMessage, { color: theme.muted }]}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
});

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
      <Text allowFontScaling style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text allowFontScaling style={[styles.statLabel, { color: theme.muted }]}>{label}</Text>
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
  const { fontScale, width } = useWindowDimensions();
  const stacked = shouldStackDenseNativeLayout(fontScale, width);

  return (
    <View
      style={[
        styles.metricTile,
        stacked ? styles.metricTileLargeText : null,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Text allowFontScaling style={[styles.metricLabel, { color: theme.muted }]}>{label}</Text>
      <Text allowFontScaling style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
      {helper ? <Text allowFontScaling style={[styles.metricHelper, { color: theme.muted }]}>{helper}</Text> : null}
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
  const { fontScale, width } = useWindowDimensions();
  const stacked = shouldStackDenseNativeLayout(fontScale, width);
  return <View style={[styles.row, stacked ? styles.rowStacked : null, style]}>{children}</View>;
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
      <Text allowFontScaling style={[styles.chipText, { color }]}>{children}</Text>
    </View>
  );
}

export function Divider() {
  const theme = useThemeColors();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

export interface ButtonProps extends Omit<PressableProps, "children"> {
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}

export function Button({
  accessibilityRole = "button",
  accessibilityState,
  children,
  disabled,
  loading = false,
  loadingLabel,
  onPress,
  style,
  variant = "primary",
  ...props
}: ButtonProps) {
  const theme = useThemeColors();
  const secondary = variant === "secondary" || variant === "ghost";
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...props}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ ...accessibilityState, busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={(state) => [
        styles.button,
        { backgroundColor: theme.inverse, borderColor: theme.inverse },
        variant === "secondary" ? { backgroundColor: theme.surface, borderColor: theme.border } : null,
        variant === "ghost" ? { backgroundColor: "transparent", borderColor: "transparent" } : null,
        isDisabled ? styles.buttonDisabled : null,
        state.pressed && !isDisabled ? styles.buttonPressed : null,
        typeof style === "function" ? style(state) : style,
      ]}
    >
      <Text
        allowFontScaling
        style={[
          styles.buttonText,
          { color: theme.inverseText },
          secondary ? { color: theme.text } : null,
          isDisabled ? { color: theme.muted } : null,
        ]}
      >
        {loading ? loadingLabel ?? children : children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  rowStacked: {
    alignItems: "stretch",
    flexDirection: "column",
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
    flexShrink: 1,
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
  fieldMessage: {
    fontSize: 12,
    lineHeight: 18,
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
  metricTileLargeText: {
    minWidth: "100%",
    width: "100%",
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
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
});
