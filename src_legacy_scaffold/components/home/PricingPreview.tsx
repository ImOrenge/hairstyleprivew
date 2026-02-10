import { Card } from "../ui/Card";

export function PricingPreview() {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <Card title="Free" description="체험용">
        <ul className="space-y-1 text-sm text-gray-700">
          <li>월 5 크레딧</li>
          <li>워터마크 포함 다운로드</li>
          <li>기본 스타일 템플릿</li>
        </ul>
      </Card>
      <Card title="Pro" description="디자이너/헤비 유저">
        <ul className="space-y-1 text-sm text-gray-700">
          <li>월 200 크레딧</li>
          <li>워터마크 제거</li>
          <li>우선 생성 큐 + 히스토리 확장</li>
        </ul>
      </Card>
    </section>
  );
}
