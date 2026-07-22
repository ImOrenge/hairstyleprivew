import { render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { AppScreen } from "../components/app/AppScreen";
import {
  NetworkRecoveryProvider,
  resolveNetworkAvailability,
  useNetworkRecovery,
} from "../components/app/NetworkRecoveryProvider";

let mockNetworkState: { isConnected?: boolean; isInternetReachable?: boolean } = {};

jest.mock("expo-network", () => ({
  useNetworkState: () => mockNetworkState,
}));

jest.mock("react-native-safe-area-context", () => {
  const ReactModule = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, props, children),
  };
});

function RecoveryProbe() {
  const { availability, recoveryToken } = useNetworkRecovery();
  return <Text>{`${availability}:${recoveryToken}`}</Text>;
}

describe("network recovery", () => {
  beforeEach(() => {
    mockNetworkState = {};
  });

  test("classifies disconnected and reachable states without treating unknown as offline", () => {
    expect(resolveNetworkAvailability({})).toBe("unknown");
    expect(resolveNetworkAvailability({ isConnected: false })).toBe("offline");
    expect(resolveNetworkAvailability({ isConnected: true, isInternetReachable: false })).toBe("offline");
    expect(resolveNetworkAvailability({ isConnected: true, isInternetReachable: true })).toBe("online");
  });

  test("emits one recovery token when the device returns online", async () => {
    mockNetworkState = { isConnected: false, isInternetReachable: false };
    const view = await render(
      <NetworkRecoveryProvider>
        <RecoveryProbe />
      </NetworkRecoveryProvider>,
    );
    expect(screen.getByText("offline:0")).toBeOnTheScreen();

    mockNetworkState = { isConnected: true, isInternetReachable: true };
    await view.rerender(
      <NetworkRecoveryProvider>
        <RecoveryProbe />
      </NetworkRecoveryProvider>,
    );

    await waitFor(() => expect(screen.getByText("online:1")).toBeOnTheScreen());
    view.unmount();
  });

  test("announces offline state while preserving the screen content", async () => {
    mockNetworkState = { isConnected: false, isInternetReachable: false };
    const view = await render(
      <NetworkRecoveryProvider>
        <AppScreen>
          <Text>작성 중인 내용</Text>
        </AppScreen>
      </NetworkRecoveryProvider>,
    );

    const notice = screen.getByText(/입력 내용은 유지/);
    expect(notice.parent?.props.accessibilityRole).toBe("alert");
    expect(screen.getByText("작성 중인 내용")).toBeOnTheScreen();
    view.unmount();
  });
});
