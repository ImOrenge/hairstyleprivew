import {
  getPhotoLibraryPermissionMessage,
  getPhotoLibraryPermissionState,
  openPhotoLibrarySettings,
} from "../lib/photo-library-permission";

describe("photo library permission recovery", () => {
  test("distinguishes granted, requestable, and settings-only permission states", () => {
    expect(getPhotoLibraryPermissionState({ canAskAgain: true, granted: true })).toBe("granted");
    expect(getPhotoLibraryPermissionState({ canAskAgain: true, granted: false })).toBe("requestable");
    expect(getPhotoLibraryPermissionState({ canAskAgain: false, granted: false })).toBe("settings");
  });

  test("only settings-only denial asks the user to recover in OS settings", () => {
    expect(getPhotoLibraryPermissionMessage("granted")).toBeNull();
    expect(getPhotoLibraryPermissionMessage("requestable")).toContain("권한 요청을 허용");
    expect(getPhotoLibraryPermissionMessage("settings")).toContain("앱 설정");
  });

  test("reports whether opening OS settings succeeded without exposing platform errors", async () => {
    const openSettings = jest.fn().mockResolvedValue(undefined);
    expect(await openPhotoLibrarySettings(openSettings)).toBe(true);
    expect(openSettings).toHaveBeenCalledTimes(1);

    expect(await openPhotoLibrarySettings(jest.fn().mockRejectedValue(new Error("private platform detail"))))
      .toBe(false);
  });
});
