import { Card } from "../ui/Card";

const features = [
  { title: "간편함", description: "사진 한 장 업로드 후 바로 스타일 적용" },
  { title: "자연스러움", description: "얼굴 영역 유지 + 헤어 영역만 변경" },
  { title: "다양함", description: "기장, 스타일, 색상 옵션으로 조합 생성" },
];

export function FeatureShowcase() {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      {features.map((feature) => (
        <Card key={feature.title} title={feature.title} description={feature.description} />
      ))}
    </section>
  );
}
