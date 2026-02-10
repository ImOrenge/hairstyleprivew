export function FaceGuideOverlay() {
  return (
    <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-sm font-semibold text-amber-900">업로드 가이드</h3>
      <ul className="mt-2 space-y-1 text-sm text-amber-800">
        <li>- 정면 얼굴이 잘 보이는 사진</li>
        <li>- 안경, 모자, 과한 필터는 제거</li>
        <li>- 해상도 512x512 이상 권장</li>
      </ul>
    </aside>
  );
}
