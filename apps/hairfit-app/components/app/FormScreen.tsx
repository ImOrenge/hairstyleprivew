import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { spacing, useThemeColors } from "@hairfit/ui-native/primitives";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { AppScreen } from "./AppScreen";

export interface FormScreenProps {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  errorFocusRef?: RefObject<TextInput | null>;
  errorFocusRequest?: number;
  footer: ReactNode;
  footerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
  testID?: string;
}

function keyboardAvoidingBehavior() {
  if (Platform.OS === "ios") return "padding" as const;
  if (Platform.OS === "android") return "height" as const;
  return undefined;
}

export function FormScreen({
  children,
  contentContainerStyle,
  errorFocusRef,
  errorFocusRequest = 0,
  footer,
  footerStyle,
  keyboardVerticalOffset = 0,
  testID,
}: FormScreenProps) {
  const theme = useThemeColors();
  const lastErrorFocusRequestRef = useRef(0);

  useEffect(() => {
    if (
      errorFocusRequest <= 0 ||
      errorFocusRequest === lastErrorFocusRequestRef.current
    ) return;

    lastErrorFocusRequestRef.current = errorFocusRequest;
    errorFocusRef?.current?.focus();
  }, [errorFocusRef, errorFocusRequest]);

  return (
    <AppScreen scroll={false}>
      <KeyboardAvoidingView
        behavior={keyboardAvoidingBehavior()}
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={styles.keyboardFrame}
        testID={testID}
      >
        <ScrollView
          contentContainerStyle={[styles.content, contentContainerStyle]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          style={styles.scroll}
          testID={testID ? `${testID}-content` : undefined}
        >
          {children}
        </ScrollView>
        <View
          style={[
            styles.footer,
            { backgroundColor: theme.background, borderTopColor: theme.border },
            footerStyle,
          ]}
          testID={testID ? `${testID}-footer` : undefined}
        >
          {footer}
        </View>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  keyboardFrame: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: spacing.md,
    padding: spacing.sm,
    paddingBottom: spacing.lg,
  },
  footer: {
    borderTopWidth: 1,
    padding: spacing.sm,
  },
});
