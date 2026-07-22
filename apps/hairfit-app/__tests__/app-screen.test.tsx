import { render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { AppScreen } from "../components/app/AppScreen";

jest.mock("react-native-safe-area-context", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const { View: NativeView } = jest.requireActual<typeof import("react-native")>("react-native");

  return {
    SafeAreaView: ({
      children,
      edges = [],
      ...props
    }: {
      children: React.ReactNode;
      edges?: string[];
    }) => ReactModule.createElement(
      NativeView,
      { ...props, accessibilityLabel: `safe-area-${edges.join("-")}` },
      children,
    ),
  };
});

describe("AppScreen", () => {
  test("keeps the normal screen inside top and bottom safe areas", async () => {
    await render(
      <AppScreen>
        <Text>화면 내용</Text>
      </AppScreen>,
    );

    expect(screen.getByLabelText("safe-area-top-bottom")).toBeOnTheScreen();
    const scrollView = screen.getByTestId("app-screen-scroll");
    expect(scrollView.props.keyboardShouldPersistTaps).toBe("handled");
    expect(["interactive", "on-drag"]).toContain(scrollView.props.keyboardDismissMode);
  });

  test("gives a fixed footer exclusive ownership of the bottom safe area", async () => {
    await render(
      <AppScreen footerOverlay={<Text>고정 작업</Text>}>
        <Text>화면 내용</Text>
      </AppScreen>,
    );

    expect(screen.getByLabelText("safe-area-top")).toBeOnTheScreen();
    expect(screen.getByLabelText("safe-area-bottom")).toBeOnTheScreen();
    expect(screen.queryByLabelText("safe-area-top-bottom")).not.toBeOnTheScreen();
    expect(screen.getByText("고정 작업")).toBeOnTheScreen();
  });
});
