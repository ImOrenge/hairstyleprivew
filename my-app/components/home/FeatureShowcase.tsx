const features = [
  {
    title: "빠른 미리보기",
    description: "사진 한 장과 프롬프트 한 줄만 넣으면 시술 전 결과를 바로 확인할 수 있어요.",
    point: "평균 생성 시간 20초 내외",
  },
  {
    title: "얼굴형 보정 중심",
    description: "헤어 영역만 자연스럽게 바꾸고 얼굴 윤곽과 피부톤은 최대한 유지합니다.",
    point: "Before/After 비교 지원",
  },
  {
    title: "다양한 조합 테스트",
    description: "기장, 펌, 컬러를 조합해 여러 후보를 한 번에 시뮬레이션할 수 있습니다.",
    point: "상담용 시안 제작에 최적",
  },
];

export function FeatureShowcase() {
  return (
    <section className="rounded-3xl border border-stone-200/80 bg-white/90 p-6 shadow-[0_18px_40px_rgba(120,91,54,0.12)] backdrop-blur sm:p-8">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Core Features</p>
        <h2 className="text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">
          결정 전에, 결과부터 확인하세요
        </h2>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {features.map((feature, index) => (
          <article
            key={feature.title}
            className="group rounded-2xl border border-stone-200/90 bg-gradient-to-b from-amber-50/70 to-white p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_14px_28px_rgba(120,91,54,0.16)]"
          >
            <span className="inline-flex rounded-full border border-amber-300/80 bg-white px-3 py-1 text-xs font-semibold text-amber-700">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-4 text-lg font-bold text-stone-900">{feature.title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-700">{feature.description}</p>
            <p className="mt-4 text-xs font-semibold text-stone-500">{feature.point}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
