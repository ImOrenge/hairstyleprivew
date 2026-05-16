import { createContext, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { spacing, useThemeColors } from "../../../packages/ui-native/src/index";

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
});
