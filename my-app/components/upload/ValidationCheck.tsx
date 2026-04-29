import { UploadStatus, UploadValidationDetails } from "../../hooks/useUpload";

interface ValidationCheckProps {
  status: UploadStatus;
  message: string;
  details: UploadValidationDetails;
}

const toneMap: Record<UploadStatus, string> = {
  idle: "border border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-muted)]",
  checking: "border border-[var(--app-accent)] bg-[var(--app-surface-muted)] text-[var(--app-text)]",
  success: "border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  error: "border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

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
    <section className={`rounded-[var(--app-radius-panel)] px-4 py-3 ${toneMap[status]}`}>
      <p className="text-sm font-medium">{message}</p>
      <div className="mt-3 grid gap-1 text-xs">
        <p>파일 형식: {formatCheckState(details.formatValid)}</p>
        <p>파일 크기(10MB 이하): {formatCheckState(details.sizeValid)}</p>
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
