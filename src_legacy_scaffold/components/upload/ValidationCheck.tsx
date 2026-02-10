import { UploadStatus } from "../../hooks/useUpload";

interface ValidationCheckProps {
  status: UploadStatus;
  message: string;
}

const toneMap: Record<UploadStatus, string> = {
  idle: "bg-gray-100 text-gray-700",
  checking: "bg-blue-100 text-blue-700",
  success: "bg-emerald-100 text-emerald-700",
  error: "bg-rose-100 text-rose-700",
};

export function ValidationCheck({ status, message }: ValidationCheckProps) {
  return (
    <div className={`rounded-xl px-4 py-3 text-sm font-medium ${toneMap[status]}`}>
      {message}
    </div>
  );
}
