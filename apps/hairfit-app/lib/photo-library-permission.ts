export type PhotoLibraryPermissionState = "granted" | "requestable" | "settings";

export interface PhotoLibraryPermissionLike {
  canAskAgain: boolean;
  granted: boolean;
}

export function getPhotoLibraryPermissionState(
  permission: PhotoLibraryPermissionLike,
): PhotoLibraryPermissionState {
  if (permission.granted) return "granted";
  return permission.canAskAgain ? "requestable" : "settings";
}

export function getPhotoLibraryPermissionMessage(state: PhotoLibraryPermissionState) {
  if (state === "settings") {
    return "사진 보관함 접근이 차단되어 있습니다. 앱 설정에서 사진 권한을 허용한 뒤 다시 시도해 주세요.";
  }
  if (state === "requestable") {
    return "사진을 선택하려면 사진 보관함 권한이 필요합니다. 다시 선택하고 권한 요청을 허용해 주세요.";
  }
  return null;
}

export async function openPhotoLibrarySettings(
  openSettings: () => Promise<void>,
) {
  try {
    await openSettings();
    return true;
  } catch {
    return false;
  }
}
