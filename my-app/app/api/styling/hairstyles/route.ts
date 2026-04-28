import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { GeneratedVariant, RecommendationSet } from "../../../../lib/recommendation-types";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

interface QueryError {
  message: string;
}

interface GenerationRow {
  id: string;
  created_at: string;
  status: string | null;
  options: unknown;
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
    catalogCycleId: typeof raw.catalogCycleId === "string" ? raw.catalogCycleId : null,
    creditChargedAt: typeof raw.creditChargedAt === "string" ? raw.creditChargedAt : null,
    creditChargeAmount: typeof raw.creditChargeAmount === "number" ? raw.creditChargeAmount : null,
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => {
            limit: (count: number) => Promise<{ data: GenerationRow[] | null; error: QueryError | null }>;
          };
        };
      };
    };
  };

  const { data, error } = await supabase
    .from("generations")
    .select("id,created_at,status,options")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const generations = (data || [])
    .map((row) => {
      const recommendationSet = normalizeRecommendationSet(
        isObject(row.options) ? row.options.recommendationSet : null,
      );
      if (!recommendationSet || recommendationSet.variants.length === 0) {
        return null;
      }

      return {
        id: row.id,
        createdAt: row.created_at,
        status: row.status || "completed",
        selectedVariantId: recommendationSet.selectedVariantId,
        analysis: recommendationSet.analysis,
        variants: recommendationSet.variants,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return NextResponse.json({ generations }, { status: 200 });
}
