import type { ReactElement } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  type FlatListProps,
  type ListRenderItemInfo,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { AppScreen } from "./AppScreen";

export interface VirtualizedListScreenProps<ItemT>
  extends Omit<FlatListProps<ItemT>, "renderItem"> {
  renderItem: (info: ListRenderItemInfo<ItemT>) => ReactElement | null;
  screenStyle?: StyleProp<ViewStyle>;
}

/**
 * App-owned screen shell for long lists. It keeps safe-area and background
 * ownership in AppScreen while ensuring FlatList is the only scroll owner.
 */
export function VirtualizedListScreen<ItemT>({
  automaticallyAdjustKeyboardInsets = Platform.OS === "ios",
  initialNumToRender = 8,
  keyboardDismissMode = Platform.OS === "ios" ? "interactive" : "on-drag",
  keyboardShouldPersistTaps = "handled",
  maxToRenderPerBatch = 8,
  renderItem,
  screenStyle,
  updateCellsBatchingPeriod = 50,
  windowSize = 7,
  ...listProps
}: VirtualizedListScreenProps<ItemT>) {
  return (
    <AppScreen scroll={false} style={[styles.screen, screenStyle]}>
      <FlatList
        {...listProps}
        automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
        initialNumToRender={initialNumToRender}
        keyboardDismissMode={keyboardDismissMode}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        maxToRenderPerBatch={maxToRenderPerBatch}
        renderItem={renderItem}
        updateCellsBatchingPeriod={updateCellsBatchingPeriod}
        windowSize={windowSize}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 0,
  },
});
