import {
  mobileCorsPreflightResponse,
  mobileJsonResponse,
  requireMobileService,
} from "../../../../lib/mobile-auth";
import type {
  CustomerStylebookCollectionMutationV2,
  CustomerStylebookItemRefV2,
  CustomerStylebookItemStatePatchV2,
  CustomerStylebookShareRequestV2,
  CustomerStylebookWearLogRequestV2,
} from "@hairfit/shared";
import { loadCustomerStylebookCollectionV2 } from "../../../../lib/v2/customer-history-server";
import {
  createCustomerStylebookReferencedConsultationV2,
  createCustomerStylebookShareV2,
  createCustomerStylebookWearLogV2,
  deleteCustomerStylebookWearLogV2,
  mutateCustomerStylebookCollectionV2,
  revokeCustomerStylebookShareV2,
  readCustomerStylebookReferenceV2,
  updateCustomerStylebookItemStateV2,
} from "../../../../lib/v2/customer-stylebook-actions-server";

export function OPTIONS(request: Request) {
  return mobileCorsPreflightResponse(request);
}

export async function GET(request: Request) {
  const context = await requireMobileService("customer");
  if (!context.ok) return context.response;

  try {
    const referenceConsultationId = new URL(request.url).searchParams.get("referenceConsultationId")?.trim();
    if (referenceConsultationId) {
      const reference = await readCustomerStylebookReferenceV2(context.userId, referenceConsultationId);
      return mobileJsonResponse(request, { reference }, { status: 200 });
    }
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

function errorResponse(request: Request, error: unknown) {
  const code = error instanceof Error ? error.message : "STYLEBOOK_ACTION_FAILED";
  const status = /NOT_FOUND/.test(code) ? 404
    : /INVALID|REQUIRED|LIMIT/.test(code) ? 400
      : 500;
  const message = code === "ITEM_NOT_FOUND" ? "확정된 스타일북 항목을 찾을 수 없습니다."
    : code === "COLLECTION_NOT_FOUND" ? "컬렉션을 찾을 수 없습니다."
      : code === "COLLECTION_LIMIT" ? "컬렉션은 최대 50개까지 만들 수 있습니다."
        : code === "PHOTO_CONSENT_REQUIRED" ? "실제 적용 사진 저장에 동의해 주세요."
          : code === "INVALID_IMAGE_TYPE" ? "JPEG, PNG, WebP 이미지만 사용할 수 있습니다."
            : code === "IMAGE_TOO_LARGE" ? "이미지는 8MB 이하로 선택해 주세요."
              : status === 400 ? "입력한 내용을 다시 확인해 주세요."
                : "스타일북 변경을 저장하지 못했습니다.";
  console.error("[mobile-stylebook] action failed", { code });
  return mobileJsonResponse(request, { error: message, code }, { status });
}

export async function PATCH(request: Request) {
  const context = await requireMobileService("customer");
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => null) as CustomerStylebookItemStatePatchV2 | null;
  if (!body) return mobileJsonResponse(request, { error: "입력한 내용을 확인해 주세요." }, { status: 400 });
  try {
    return mobileJsonResponse(request, await updateCustomerStylebookItemStateV2(context.userId, body));
  } catch (error) {
    return errorResponse(request, error);
  }
}

export async function POST(request: Request) {
  const context = await requireMobileService("customer");
  if (!context.ok) return context.response;
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const rawValue = String(form.get("value") ?? "");
      const value = JSON.parse(rawValue) as CustomerStylebookWearLogRequestV2;
      const fileValue = form.get("file");
      return mobileJsonResponse(request, await createCustomerStylebookWearLogV2({
        userId: context.userId,
        value,
        file: fileValue instanceof File ? fileValue : null,
        photoConsent: form.get("photoConsent") === "true",
      }), { status: 201 });
    }

    const body = await request.json().catch(() => null) as null | {
      action?: "collection" | "share" | "reference";
      collection?: CustomerStylebookCollectionMutationV2;
      share?: CustomerStylebookShareRequestV2;
      item?: CustomerStylebookItemRefV2;
    };
    if (body?.action === "collection" && body.collection) {
      return mobileJsonResponse(request, await mutateCustomerStylebookCollectionV2(context.userId, body.collection));
    }
    if (body?.action === "share" && body.share) {
      return mobileJsonResponse(request, await createCustomerStylebookShareV2(context.userId, body.share), { status: 201 });
    }
    if (body?.action === "reference" && body.item) {
      return mobileJsonResponse(request, await createCustomerStylebookReferencedConsultationV2(context.userId, body.item), { status: 201 });
    }
    return mobileJsonResponse(request, { error: "지원하지 않는 스타일북 작업입니다." }, { status: 400 });
  } catch (error) {
    return errorResponse(request, error);
  }
}

export async function DELETE(request: Request) {
  const context = await requireMobileService("customer");
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => null) as null | {
    action?: "wear_log" | "share";
    id?: string;
  };
  if (!body?.id) return mobileJsonResponse(request, { error: "삭제할 항목을 확인해 주세요." }, { status: 400 });
  try {
    if (body.action === "wear_log") {
      return mobileJsonResponse(request, await deleteCustomerStylebookWearLogV2(context.userId, body.id));
    }
    if (body.action === "share") {
      return mobileJsonResponse(request, await revokeCustomerStylebookShareV2(context.userId, body.id));
    }
    return mobileJsonResponse(request, { error: "지원하지 않는 삭제 작업입니다." }, { status: 400 });
  } catch (error) {
    return errorResponse(request, error);
  }
}
