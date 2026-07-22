import { act, renderHook } from "@testing-library/react-native";
import { Linking } from "react-native";
import { usePhotoLibraryPermissionRecovery } from "../hooks/usePhotoLibraryPermissionRecovery";

describe("usePhotoLibraryPermissionRecovery", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("shows settings recovery only for a settings-only denial", async () => {
    const { result } = await renderHook(() => usePhotoLibraryPermissionRecovery());

    await act(() => {
      expect(result.current.resolvePhotoLibraryPermission({
        canAskAgain: false,
        granted: false,
      })).toBe("settings");
    });
    expect(result.current.photoPermissionRequiresSettings).toBe(true);

    await act(() => {
      expect(result.current.resolvePhotoLibraryPermission({
        canAskAgain: true,
        granted: true,
      })).toBe("granted");
    });
    expect(result.current.photoPermissionRequiresSettings).toBe(false);
  });

  test("opens the operating-system app settings through Linking", async () => {
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    const { result } = await renderHook(() => usePhotoLibraryPermissionRecovery());
    let opened = false;

    await act(async () => {
      opened = await result.current.openPermissionSettings();
    });

    expect(opened).toBe(true);
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});
