import { NextResponse } from "next/server";
import { getActiveCatalogV2 } from "../../../../../lib/v2/catalog-server";
import { isHairfitV2Enabled } from "../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../lib/v2/http";

const PUBLIC_KEYS = new Set(["full_style_once","full_style_quarterly","full_style_annual"]);

export async function GET() {
  if (!isHairfitV2Enabled("FULL_STYLE_CATALOG_ENABLED")) {
    return NextResponse.json({ error:"상품 카탈로그를 준비 중입니다." }, { status:404 });
  }
  try {
    const catalog = await getActiveCatalogV2();
    return NextResponse.json({
      schemaVersion:"public-offer-catalog-v1",
      catalogVersion:catalog.catalogVersion,
      generatedAt:catalog.generatedAt,
      offerings:catalog.offerings.filter((offering) => PUBLIC_KEYS.has(offering.key)).map((offering) => ({
        key:offering.key,
        version:offering.version,
        customerName:offering.customerName,
        description:offering.description,
        purchaseMode:offering.purchaseMode,
        billingInterval:offering.billingInterval,
        includedConsultationSessions:offering.includedConsultationSessions,
        capabilities:offering.capabilities,
        prices:offering.prices.map((price) => ({ version:price.version,currency:price.currency,amountMinor:price.amountMinor })),
      })),
    });
  } catch (error) { return v2Failure(error); }
}
