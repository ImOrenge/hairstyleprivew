import * as ImagePicker from "expo-image-picker";

export type NativePhotoSource = "camera" | "library";

type NativeImagePickerOutcome =
  | { type: "permission-denied"; message: string }
  | { type: "error"; message: string }
  | { type: "result"; result: ImagePicker.ImagePickerResult };

const permissionMessages: Record<NativePhotoSource, string> = {
  camera: "Camera permission is required to take a photo.",
  library: "Photo library permission is required to choose a photo.",
};

const fallbackErrorMessages: Record<NativePhotoSource, string> = {
  camera: "Could not open the camera.",
  library: "Could not open the photo library.",
};

async function requestPermission(source: NativePhotoSource) {
  return source === "camera"
    ? ImagePicker.requestCameraPermissionsAsync()
    : ImagePicker.requestMediaLibraryPermissionsAsync();
}

export async function pickImageWithPermission(
  source: NativePhotoSource,
  options: ImagePicker.ImagePickerOptions,
): Promise<NativeImagePickerOutcome> {
  try {
    const permission = await requestPermission(source);
    if (!permission.granted) {
      return { type: "permission-denied", message: permissionMessages[source] };
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    return { type: "result", result };
  } catch (error) {
    return {
      type: "error",
      message: error instanceof Error ? error.message : fallbackErrorMessages[source],
    };
  }
}
