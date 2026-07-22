import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

interface FaceGuideOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function FaceGuideOverlay({ open, onClose }: FaceGuideOverlayProps) {
  return (
    <Dialog
      id="face-guide-dialog"
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title="사진 업로드 가이드"
      description="정확한 생성 결과를 위해 아래 조건을 만족하는 사진을 권장합니다."
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          확인했습니다
        </Button>
      }
    >
      <ul className="list-disc space-y-2 pl-5 text-sm text-[var(--app-muted)]">
        <li>정면 얼굴이 선명하게 보이는 사진</li>
        <li>머리 윤곽이 잘 보이도록 배경과 분리된 사진</li>
        <li>안경, 모자, 강한 뷰티 필터를 제거한 사진</li>
        <li>최소 512x512 이상 해상도</li>
      </ul>
    </Dialog>
  );
}
