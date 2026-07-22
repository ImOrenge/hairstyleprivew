export type UploadStatus = "idle" | "checking" | "success" | "error";

export interface UploadValidationDetails {
  formatValid: boolean | null;
  sizeValid: boolean | null;
  resolutionValid: boolean | null;
  faceValid: boolean | null;
  faceDetectionSupported: boolean;
  faceDetectionEngine: "FaceDetector" | "none";
  width: number | null;
  height: number | null;
  sizeMB: number | null;
}
