import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { PhotoLibraryPermissionRecovery } from "../components/app/PhotoLibraryPermissionRecovery";

describe("PhotoLibraryPermissionRecovery", () => {
  test("stays absent until OS settings are required", async () => {
    const view = await render(
      <PhotoLibraryPermissionRecovery onOpenSettings={jest.fn()} visible={false} />,
    );

    expect(screen.queryByTestId("photo-library-permission-recovery")).not.toBeOnTheScreen();
    view.unmount();
  });

  test("explains recovery and opens settings from an explicit CTA", async () => {
    const onOpenSettings = jest.fn();
    const view = await render(
      <PhotoLibraryPermissionRecovery onOpenSettings={onOpenSettings} visible />,
    );

    expect(screen.getByText(/앱에서 다시 권한을 요청할 수 없습니다/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "앱 설정 열기" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
