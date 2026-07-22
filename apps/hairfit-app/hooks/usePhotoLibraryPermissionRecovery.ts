import { useCallback, useState } from "react";
import { Linking } from "react-native";
import {
  getPhotoLibraryPermissionState,
  openPhotoLibrarySettings,
  type PhotoLibraryPermissionLike,
} from "../lib/photo-library-permission";

export function usePhotoLibraryPermissionRecovery() {
  const [photoPermissionRequiresSettings, setPhotoPermissionRequiresSettings] = useState(false);

  const resolvePhotoLibraryPermission = useCallback((permission: PhotoLibraryPermissionLike) => {
    const state = getPhotoLibraryPermissionState(permission);
    setPhotoPermissionRequiresSettings(state === "settings");
    return state;
  }, []);

  const openPermissionSettings = useCallback(
    () => openPhotoLibrarySettings(() => Linking.openSettings()),
    [],
  );

  return {
    openPermissionSettings,
    photoPermissionRequiresSettings,
    resolvePhotoLibraryPermission,
  };
}
