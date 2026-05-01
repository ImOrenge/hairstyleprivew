import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

export const colors = {
  background: "#f7f4ef",
  surface: "#fffdf8",
  surfaceMuted: "#eee8de",
  text: "#181411",
  muted: "#706861",
  border: "#ded6ca",
  inverse: "#171412",
  inverseText: "#fffaf2",
  accent: "#c17b35",
  success: "#117a4b",
  danger: "#b42318",
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
};

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <ScrollView contentContainerStyle={[styles.screen, style]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Stack({ children, gap = spacing.md, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Kicker({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.kicker, style]}>{children}</Text>;
}

export function Heading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.heading, style]}>{children}</Text>;
}

export function BodyText({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function TextField({
  label,
  style,
  ...props
}: TextInputProps & { label?: ReactNode }) {
  return (
    <View style={styles.field}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, style]}
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
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  return (
    <View
      style={[
        styles.chip,
        tone === "accent" ? styles.chipAccent : null,
        tone === "success" ? styles.chipSuccess : null,
        tone === "danger" ? styles.chipDanger : null,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          tone === "accent" ? styles.chipTextAccent : null,
          tone === "success" ? styles.chipTextSuccess : null,
          tone === "danger" ? styles.chipTextDanger : null,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
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
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" ? styles.buttonSecondary : null,
        variant === "ghost" ? styles.buttonGhost : null,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "secondary" || variant === "ghost" ? styles.buttonTextSecondary : null,
          disabled ? styles.buttonTextDisabled : null,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    gap: spacing.lg,
    minHeight: "100%",
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: spacing.md,
  },
  kicker: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
  },
  body: {
    color: colors.muted,
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
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipAccent: {
    backgroundColor: "#fff3df",
  },
  chipSuccess: {
    backgroundColor: "#e8f7ef",
  },
  chipDanger: {
    backgroundColor: "#fff0ee",
  },
  chipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  chipTextAccent: {
    color: colors.accent,
  },
  chipTextSuccess: {
    color: colors.success,
  },
  chipTextDanger: {
    color: colors.danger,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
    width: "100%",
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  stat: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    padding: spacing.md,
  },
  statValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.inverse,
    borderColor: colors.inverse,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  buttonGhost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: colors.inverseText,
    fontSize: 15,
    fontWeight: "800",
  },
  buttonTextSecondary: {
    color: colors.text,
  },
  buttonTextDisabled: {
    color: colors.muted,
  },
});
