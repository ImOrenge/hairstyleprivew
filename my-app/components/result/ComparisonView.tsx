"use client";

interface ComparisonViewProps {
  beforeImage: string;
  afterImage: string;
}

export function ComparisonView({ beforeImage, afterImage }: ComparisonViewProps) {
  return (
    <section className="mx-auto w-full max-w-2xl space-y-3">
      <div
        tabIndex={0}
        className="group relative aspect-[4/5] overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
      >
        <img src={afterImage} alt="생성 이미지" className="h-full w-full object-cover" />

        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
          <img src={beforeImage} alt="원본 이미지 오버레이" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/20" />
        </div>

        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/65 px-3 py-1 text-xs font-medium text-white">
          생성 이미지
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
          원본 오버레이
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-4 py-4">
          <p className="text-xs text-white/90">
            마우스를 올리면 원본 사진이 오버레이되어 비교됩니다.
          </p>
        </div>
      </div>
    </section>
  );
}
