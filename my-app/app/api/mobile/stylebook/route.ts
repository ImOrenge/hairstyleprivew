import {
  mobileCorsPreflightResponse,
  mobileJsonResponse,
  requireMobileService,
} from "../../../../lib/mobile-auth";
import { loadCustomerStylebookCollectionV2 } from "../../../../lib/v2/customer-history-server";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: Request) {
  const context = await requireMobileService("customer");
  if (!context.ok) return context.response;

  try {
    const stylebook = await loadCustomerStylebookCollectionV2(context.userId);
    return mobileJsonResponse(request, stylebook, { status: 200 });
  } catch (error) {
    console.error("[mobile-stylebook] failed to load V2 collection", error);
    return mobileJsonResponse(
      request,
      { error: "스타일북을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
