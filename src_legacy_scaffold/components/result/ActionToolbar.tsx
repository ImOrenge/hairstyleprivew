"use client";

import { Button } from "../ui/Button";

interface ActionToolbarProps {
  id: string;
}

export function ActionToolbar({ id }: ActionToolbarProps) {
  const handleCopy = async () => {
    const shareLink = `${window.location.origin}/result/${id}`;
    await navigator.clipboard.writeText(shareLink);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={handleCopy}>
        링크 복사
      </Button>
      <Button variant="secondary">다운로드</Button>
      <Button onClick={() => window.history.back()}>옵션 수정 후 다시 생성</Button>
    </div>
  );
}
