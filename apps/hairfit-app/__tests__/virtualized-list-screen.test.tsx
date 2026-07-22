import { render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { VirtualizedListScreen } from "../components/app/VirtualizedListScreen";

jest.mock("react-native-safe-area-context", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");

  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, props, children),
  };
});

describe("VirtualizedListScreen", () => {
  test("keeps FlatList as the sole scroll owner and forwards list contracts", async () => {
    const onEndReached = jest.fn();
    await render(
      <VirtualizedListScreen
        data={[{ id: "1", label: "첫 항목" }, { id: "2", label: "둘째 항목" }]}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<Text>목록 머리말</Text>}
        onEndReached={onEndReached}
        renderItem={({ item }) => <Text>{item.label}</Text>}
        testID="virtualized-list"
      />,
    );

    const list = screen.getByTestId("virtualized-list");
    expect(list).toBeOnTheScreen();
    expect(list.props.initialNumToRender).toBe(8);
    expect(list.props.keyboardShouldPersistTaps).toBe("handled");
    expect(list.props.maxToRenderPerBatch).toBe(8);
    expect(list.props.updateCellsBatchingPeriod).toBe(50);
    expect(list.props.windowSize).toBe(7);
    expect(screen.getByText("목록 머리말")).toBeOnTheScreen();
    expect(screen.getByText("첫 항목")).toBeOnTheScreen();
    expect(screen.getByText("둘째 항목")).toBeOnTheScreen();
  });

  test("allows feature-owned list tuning to override the shared defaults", async () => {
    await render(
      <VirtualizedListScreen
        data={[{ id: "1", label: "항목" }]}
        initialNumToRender={2}
        keyboardDismissMode="none"
        keyboardShouldPersistTaps="never"
        keyExtractor={(item) => item.id}
        maxToRenderPerBatch={3}
        renderItem={({ item }) => <Text>{item.label}</Text>}
        testID="tuned-virtualized-list"
        updateCellsBatchingPeriod={80}
        windowSize={5}
      />,
    );

    const list = screen.getByTestId("tuned-virtualized-list");
    expect(list.props.initialNumToRender).toBe(2);
    expect(list.props.keyboardDismissMode).toBe("none");
    expect(list.props.keyboardShouldPersistTaps).toBe("never");
    expect(list.props.maxToRenderPerBatch).toBe(3);
    expect(list.props.updateCellsBatchingPeriod).toBe(80);
    expect(list.props.windowSize).toBe(5);
  });
});
