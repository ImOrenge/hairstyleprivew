import type { UploadStatus, UploadValidationDetails } from "../../lib/upload-validation-contract";

export interface ValidationCheckProps {
  status: UploadStatus;
  message: string;
  details: UploadValidationDetails;
}

function formatCheckState(value: boolean | null) {
  if (value === null) {
    return "대기";
  }

  return value ? "통과" : "실패";
}

export function ValidationCheck({ status, message, details }: ValidationCheckProps) {
  const engineLabel =
    details.faceDetectionEngine === "FaceDetector" ? "FaceDetector" : "미사용";

  return (
    <section
      className="c-upload-validation"
      data-status={status}
      role={status === "error" ? "alert" : "status"}
      aria-live={status === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      aria-busy={status === "checking" || undefined}
    >
      <p className="c-upload-validation__message">{message}</p>
      <div className="c-upload-validation__details">
        <p>파일 형식: {formatCheckState(details.formatValid)}</p>
        <p>파일 크기(8MB 이하): {formatCheckState(details.sizeValid)}</p>
        <p>해상도(512x512 이상): {formatCheckState(details.resolutionValid)}</p>
        <p>
          얼굴 감지:
          {details.faceDetectionSupported
            ? ` ${formatCheckState(details.faceValid)}`
            : " 미지원/미사용"}
        </p>
        <p>감지 엔진: {engineLabel}</p>
        {details.width && details.height ? <p>해상도: {details.width} x {details.height}</p> : null}
        {details.sizeMB !== null ? <p>파일 크기: {details.sizeMB}MB</p> : null}
      </div>
    </section>
  );
}
