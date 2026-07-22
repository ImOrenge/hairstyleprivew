import { type ReactNode } from "react";
import { spacing, useThemeColors } from "@hairfit/ui-native/primitives";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNetworkRecovery } from "./NetworkRecoveryProvider";

export interface HeaderMenuItem {
  label: string;
  path: string;
}

/**
 * @deprecated Header navigation belongs to Expo Router. This compatibility
 * provider now preserves children only and will be removed after screen imports migrate.
 */
export function HeaderNavigationProvider({ children }: { children: ReactNode; value?: unknown }) {
  return <>{children}</>;
}

const screenPattern = {
  lineAlt: "rgba(168, 134, 58, 0.18)",
  linePrimary: "rgba(208, 176, 106, 0.24)",
  lineWidth: 1.3,
  opacity: 0.58,
  tileSize: 64,
} as const;

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

export interface AppScreenProps {
  children: ReactNode;
  footerOverlay?: ReactNode;
  /** Disable the outer ScrollView when the screen owns a FlatList/SectionList. */
  scroll?: boolean;
  /** @deprecated Header rendering is owned by Expo Router layouts. */
  showHeader?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AppScreen({ children, footerOverlay, scroll = true, style }: AppScreenProps) {
  const theme = useThemeColors();
  const { availability } = useNetworkRecovery();
  const offlineNotice = availability === "offline" ? (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      style={[styles.offlineNotice, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}
    >
      <Text style={[styles.offlineNoticeText, { color: theme.danger }]}>인터넷 연결이 끊겼습니다. 입력 내용은 유지되며, 연결되면 현재 화면의 정보를 다시 확인합니다.</Text>
    </View>
  ) : null;

  return (
    <SafeAreaView
      edges={footerOverlay ? ["top"] : ["top", "bottom"]}
      style={[styles.screenFrame, { backgroundColor: theme.background }]}
    >
      <PatternLayer />
      {scroll ? (
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={[styles.screen, footerOverlay ? styles.screenWithFooterOverlay : null, style]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          testID="app-screen-scroll"
        >
          {offlineNotice}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.nonScrollingScreen, footerOverlay ? styles.screenWithFooterOverlay : null, style]}>
          {offlineNotice}
          {children}
        </View>
      )}
      {footerOverlay ? (
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.footerOverlay, { backgroundColor: theme.background, borderTopColor: theme.border }]}
        >
          {footerOverlay}
        </SafeAreaView>
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
  nonScrollingScreen: {
    flex: 1,
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
  offlineNotice: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  offlineNoticeText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  patternLine: {
    opacity: screenPattern.opacity,
    position: "absolute",
    width: screenPattern.lineWidth,
  },
});
