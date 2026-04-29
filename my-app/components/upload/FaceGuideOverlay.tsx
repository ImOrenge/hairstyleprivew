import { Button } from "../ui/Button";

interface FaceGuideOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function FaceGuideOverlay({ open, onClose }: FaceGuideOverlayProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-6">
      <div className="app-panel w-full max-w-lg p-6">
        <h3 className="text-lg font-semibold text-[var(--app-text)]">사진 업로드 가이드</h3>
        <p className="mt-2 text-sm text-[var(--app-muted)]">
          정확한 생성 결과를 위해 아래 조건을 만족하는 사진을 권장합니다.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-[var(--app-muted)]">
          <li>- 정면 얼굴이 선명하게 보이는 사진</li>
          <li>- 머리 윤곽이 잘 보이도록 배경과 분리된 사진</li>
          <li>- 안경, 모자, 강한 뷰티 필터는 제거</li>
          <li>- 최소 512x512 이상 해상도</li>
        </ul>
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
