import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadGenerationImageDataUrl } from "../../../../../lib/generation-image-storage";
import {
  GENERATION_ASSETS_EXPIRED_MESSAGE,
  isGeneratedAssetsExpired,
} from "../../../../../lib/generation-retention";
import type { GeneratedVariant, RecommendationSet } from "../../../../../lib/recommendation-types";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

interface ExportRequest {
  selectedVariantId?: string;
  serviceMemo?: string;
}

interface ExportSupabaseClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  storage: SupabaseClient["storage"];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRecommendationSet(raw: unknown): RecommendationSet | null {
  if (!isObject(raw) || !isObject(raw.analysis) || !Array.isArray(raw.variants)) {
    return null;
  }

  return {
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : new Date().toISOString(),
    analysis: raw.analysis as unknown as RecommendationSet["analysis"],
    variants: raw.variants as GeneratedVariant[],
    selectedVariantId: typeof raw.selectedVariantId === "string" ? raw.selectedVariantId : null,
    styleTarget: raw.styleTarget === "male" || raw.styleTarget === "female" ? raw.styleTarget : null,
    catalogCycleId: typeof raw.catalogCycleId === "string" ? raw.catalogCycleId : null,
    creditChargedAt: typeof raw.creditChargedAt === "string" ? raw.creditChargedAt : null,
    creditChargeAmount: typeof raw.creditChargeAmount === "number" ? raw.creditChargeAmount : null,
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderList(title: string, items: string[] | undefined) {
  if (!items?.length) {
    return "";
  }

  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  `;
}

function renderKeyValueSection(title: string, values: Array<[string, unknown]>) {
  const rows = values.filter(([, value]) => typeof value === "string" ? Boolean(value.trim()) : value !== null && value !== undefined);
  if (!rows.length) {
    return "";
  }

  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <dl>
        ${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}
      </dl>
    </section>
  `;
}

function renderEvaluation(evaluation: GeneratedVariant["evaluation"]) {
  if (!evaluation) {
    return "";
  }

  if (!isObject(evaluation)) {
    return "";
  }

  return renderKeyValueSection("AI 평가", Object.entries(evaluation).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.join(", ") : isObject(value) ? JSON.stringify(value) : value,
  ]));
}

function buildConsultationSheet(input: {
  generationId: string;
  generatedAt: string | null;
  imageDataUrl: string | null;
  serviceMemo: string;
  variant: GeneratedVariant;
  set: RecommendationSet;
}) {
  const brief = input.variant.designerBrief;
  const analysis = input.set.analysis;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HairFit 상담 시트</title>
  <style>
    :root { color: #1c1917; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f8f7f4; }
    main { max-width: 920px; margin: 0 auto; padding: 32px 24px 48px; }
    header, section { background: #fff; border: 1px solid #e7e5e4; border-radius: 8px; padding: 20px; margin-bottom: 14px; }
    h1 { margin: 0; font-size: 30px; line-height: 1.2; }
    h2 { margin: 0 0 12px; font-size: 17px; }
    p { margin: 0; line-height: 1.65; }
    .muted { color: #78716c; font-size: 13px; margin-top: 8px; }
    .hero { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(240px, 320px); align-items: start; }
    img { width: 100%; border-radius: 8px; border: 1px solid #e7e5e4; }
    dl { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px 16px; margin: 0; }
    dt { color: #78716c; font-size: 13px; font-weight: 700; }
    dd { margin: 0; line-height: 1.55; }
    ul { margin: 0; padding-left: 18px; line-height: 1.7; }
    @media print {
      body { background: #fff; }
      main { padding: 0; }
      header, section { break-inside: avoid; }
    }
    @media (max-width: 760px) {
      main { padding: 20px 14px 36px; }
      .hero { grid-template-columns: 1fr; }
      dl { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <div>
        <p class="muted">HairFit 상담 시트 · ${escapeHtml(formatDate(input.generatedAt))}</p>
        <h1>${escapeHtml(input.variant.label || "헤어 결과")}</h1>
        <p class="muted">Generation ${escapeHtml(input.generationId)}</p>
        <p style="margin-top: 14px;">${escapeHtml(input.variant.reason)}</p>
      </div>
      ${input.imageDataUrl ? `<img src="${input.imageDataUrl}" alt="선택한 헤어스타일 결과" />` : ""}
    </header>

    ${renderKeyValueSection("디자이너 브리프", [
      ["핵심 제안", brief?.headline],
      ["상담 요약", brief?.consultationSummary],
      ["커트 방향", brief?.cutDirection],
      ["볼륨/텍스처", brief?.volumeTextureDirection],
      ["스타일링", brief?.stylingDirection],
    ])}
    ${renderList("주의 메모", brief?.cautionNotes)}
    ${renderList("살롱 키워드", brief?.salonKeywords)}
    ${renderKeyValueSection("분석 요약", [
      ["얼굴형", analysis.faceShape],
      ["두상", analysis.headShape],
      ["가르마 전략", analysis.partingStrategy],
      ["길이 전략", analysis.bestLengthStrategy],
      ["요약", analysis.summary],
    ])}
    ${renderList("볼륨 포커스", analysis.volumeFocus)}
    ${renderList("피해야 할 요소", analysis.avoidNotes)}
    ${renderEvaluation(input.variant.evaluation)}
    ${input.serviceMemo ? renderKeyValueSection("시술 메모", [["메모", input.serviceMemo]]) : ""}
  </main>
</body>
</html>`;
}

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const generationId = id?.trim() || "";
  if (!generationId) {
    return NextResponse.json({ error: "generation id is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as ExportRequest;
  const selectedVariantId = body.selectedVariantId?.trim() || "";
  const serviceMemo = body.serviceMemo?.trim().slice(0, 1200) || "";
  const supabase = getSupabaseAdminClient() as unknown as ExportSupabaseClient;

  const { data: generation, error } = await supabase
    .from("generations")
    .select("id,user_id,created_at,generated_assets_expires_at,options")
    .eq("id", generationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!generation) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }
  if (generation.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isGeneratedAssetsExpired(generation.generated_assets_expires_at)) {
    return NextResponse.json({ error: GENERATION_ASSETS_EXPIRED_MESSAGE }, { status: 410 });
  }

  const recommendationSet = normalizeRecommendationSet(
    isObject(generation.options) ? generation.options.recommendationSet : null,
  );
  if (!recommendationSet) {
    return NextResponse.json({ error: "Recommendation set not found" }, { status: 400 });
  }

  const variant =
    (selectedVariantId ? recommendationSet.variants.find((item) => item.id === selectedVariantId) : null) ||
    (recommendationSet.selectedVariantId
      ? recommendationSet.variants.find((item) => item.id === recommendationSet.selectedVariantId)
      : null) ||
    recommendationSet.variants.find((item) => item.outputUrl || item.generatedImagePath) ||
    null;

  if (!variant) {
    return NextResponse.json({ error: "Generated variant not found" }, { status: 404 });
  }

  const imageDataUrl = await downloadGenerationImageDataUrl(supabase, {
    outputUrl: variant.outputUrl,
    generatedImagePath: variant.generatedImagePath,
  }).catch((downloadError) => {
    console.error("[generations/export] Failed to embed generated image", downloadError);
    return null;
  });

  const html = buildConsultationSheet({
    generationId,
    generatedAt: typeof generation.created_at === "string" ? generation.created_at : recommendationSet.generatedAt,
    imageDataUrl,
    serviceMemo,
    variant,
    set: recommendationSet,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="hairfit-consultation-${generationId}.html"`,
      "X-HairFit-Export-Format": "html-printable",
    },
  });
}
