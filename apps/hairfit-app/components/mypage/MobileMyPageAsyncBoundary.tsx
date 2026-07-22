import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { BodyText, Card, Stack } from "@hairfit/ui-native";

interface MobileMyPageAsyncBoundaryProps {
  children: ReactNode;
  pending?: boolean;
  error?: string | null;
  isEmpty?: boolean;
  loadingText?: string;
  emptyText?: string;
}

export function MobileMyPageAsyncBoundary({
  children,
  pending = false,
  error = null,
  isEmpty = false,
  loadingText = "불러오는 중...",
  emptyText = "표시할 내용이 없습니다.",
}: MobileMyPageAsyncBoundaryProps) {
  if (error) {
    return (
      <View accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Card>
          <BodyText>{error}</BodyText>
        </Card>
      </View>
    );
  }

  if (pending) {
    return (
      <View accessibilityRole="progressbar" accessibilityLiveRegion="polite">
        <Card>
          <BodyText>{loadingText}</BodyText>
        </Card>
      </View>
    );
  }

  if (isEmpty) {
    return (
      <Card style={styles.emptyCard}>
        <Stack gap={8}>
          <BodyText style={styles.centerText}>{emptyText}</BodyText>
        </Stack>
      </Card>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centerText: {
    textAlign: "center",
  },
  emptyCard: {
    borderStyle: "dashed",
    paddingVertical: 28,
  },
});
