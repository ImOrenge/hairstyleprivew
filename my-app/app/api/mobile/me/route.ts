import {
  getMobileApiContext,
  mobileCorsPreflightResponse,
  mobileJsonResponse,
} from "../../../../lib/mobile-auth";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: Request) {
  const context = await getMobileApiContext(request);
  if (!context.ok) {
    return context.response;
  }

  return mobileJsonResponse(request, context.bootstrap, { status: 200 });
}
