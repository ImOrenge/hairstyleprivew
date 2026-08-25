import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { AppScreen } from "../app/AppScreen";
import { customerColors } from "../../lib/customer-ui";

export function CustomerScreen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <AppScreen backgroundColor={customerColors.canvas} showPattern={false} style={[styles.screen, style]}>
      {children}
    </AppScreen>
  );
}

export function CustomerKicker({ children }: { children: ReactNode }) {
  return <Text style={styles.kicker}>{children}</Text>;
}

export function CustomerHeading({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <Text style={[styles.heading, compact ? styles.headingCompact : null]}>{children}</Text>;
}

export function CustomerBody({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function CustomerCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CustomerButton({
  children,
  disabled = false,
  loading = false,
  onPress,
  secondary = false,
}: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.buttonSecondary : styles.buttonPrimary,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      {loading ? <ActivityIndicator color={secondary ? customerColors.ivory : customerColors.canvas} /> : null}
      <Text style={[styles.buttonLabel, secondary ? styles.buttonLabelSecondary : styles.buttonLabelPrimary]}>{children}</Text>
    </Pressable>
  );
}

export function CustomerSectionHeader({ kicker, title }: { kicker: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <CustomerKicker>{kicker}</CustomerKicker>
      <CustomerHeading compact>{title}</CustomerHeading>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  kicker: {
    color: customerColors.champagne,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  heading: {
    color: customerColors.ivory,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -1.3,
    lineHeight: 38,
  },
  headingCompact: {
    fontSize: 24,
    letterSpacing: -0.8,
    lineHeight: 30,
  },
  body: {
    color: customerColors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  card: {
    backgroundColor: customerColors.surface,
    borderColor: customerColors.line,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    padding: 18,
  },
  button: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 20,
  },
  buttonPrimary: {
    backgroundColor: customerColors.champagne,
    borderColor: customerColors.champagne,
  },
  buttonSecondary: {
    backgroundColor: customerColors.raised,
    borderColor: customerColors.line,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  buttonLabelPrimary: {
    color: customerColors.canvas,
  },
  buttonLabelSecondary: {
    color: customerColors.ivory,
  },
  sectionHeader: {
    gap: 5,
    paddingTop: 16,
  },
});
