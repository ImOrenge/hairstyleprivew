import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GENERATION_UPLOAD_MAX_BYTES,
  isGenerationUploadMimeType,
} from "@hairfit/shared";
import {
  removeGenerationOriginalImage,
  uploadGenerationOriginalImage,
} from "../../../../lib/generation-image-storage";
import { evaluateGenerationDraftReuse } from "../../../../lib/generation-upload-draft-reuse";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

interface DraftUploadRequest {
  clientRequestId?: string;
  referenceImageDataUrl?: string;
  retentionDays?: 1 | 7 | 30;
}

interface DraftRow {
  id?: unknown;
  client_request_id?: unknown;
  state?: unknown;
  original_image_path?: unknown;
  uploaded_at?: unknown;
  expires_at?: unknown;
}

interface DraftSelectQuery {
  eq: (column: string, value: string) => DraftSelectQuery;
  maybeSingle: () => Promise<{
    data: DraftRow | null;
    error: { message: string } | null;
  }>;
}

interface DraftUploadClient {
  from: (table: string) => {
    select: (columns: string) => DraftSelectQuery;
  };
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  storage: SupabaseClient["storage"];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DATA_URL_LENGTH = 12_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

class ImageUploadRequestError extends Error {
  constructor(
    readonly code: "INVALID_IMAGE_DATA" | "UNSUPPORTED_IMAGE_TYPE" | "IMAGE_TOO_LARGE",
    readonly status: 400 | 413 | 415,
    message: string,
  ) {
    super(message);
    this.name = "ImageUploadRequestError";
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseImageDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=\r\n]+)$/);
  if (!match) {
    throw new ImageUploadRequestError(
      "INVALID_IMAGE_DATA",
      400,
      "Invalid base64 image data",
    );
  }
  const contentType = (match[1] || "").toLowerCase();
  if (!isGenerationUploadMimeType(contentType)) {
    throw new ImageUploadRequestError(
      "UNSUPPORTED_IMAGE_TYPE",
      415,
      "Unsupported image type",
    );
  }
  const buffer = Buffer.from((match[2] || "").replace(/[\r\n]/g, ""), "base64");
  if (buffer.length === 0) {
    throw new ImageUploadRequestError("INVALID_IMAGE_DATA", 400, "Empty image data");
  }
  if (buffer.length > GENERATION_UPLOAD_MAX_BYTES) {
    throw new ImageUploadRequestError("IMAGE_TOO_LARGE", 413, "Image exceeds 8MB");
  }
  return { buffer, contentType };
}

async function sha256Hex(buffer: Buffer) {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(buffer));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureUserProfile(userId: string, supabase: DraftUploadClient) {
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress?.trim() ??
    user?.emailAddresses?.[0]?.emailAddress?.trim() ??
    `${userId}@placeholder.local`;
  const displayName =
    user?.fullName?.trim() ??
    user?.firstName?.trim() ??
    user?.username?.trim() ??
    null;
  const { error } = await supabase.rpc("ensure_user_profile", {
    p_user_id: userId,
    p_email: email,
    p_display_name: displayName,
  });
  if (error) throw new Error(error.message);
}

async function loadDraft(
  supabase: DraftUploadClient,
  userId: string,
  clientRequestId: string,
) {
  const { data, error } = await supabase
    .from("generation_upload_drafts")
    .select("id,client_request_id,state,original_image_path,uploaded_at,expires_at")
    .eq("user_id", userId)
    .eq("client_request_id", clientRequestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function draftResponse(row: DraftRow, alreadyUploaded: boolean) {
  return {
    draftId: readString(row.id),
    clientRequestId: readString(row.client_request_id),
    state: readString(row.state) || "ready",
    uploadedAt: readString(row.uploaded_at) || null,
    expiresAt: readString(row.expires_at) || null,
    alreadyUploaded,
  };
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ code: "AUTH_REQUIRED", error: "로그인이 필요합니다.", retryTarget: "refresh" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as DraftUploadRequest;
  const clientRequestId = body.clientRequestId?.trim() || "";
  const referenceImageDataUrl = body.referenceImageDataUrl?.trim() || "";
  const retentionDays = body.retentionDays === 7 || body.retentionDays === 30 ? body.retentionDays : 1;
  if (!UUID_PATTERN.test(clientRequestId)) {
    return NextResponse.json({ code: "INVALID_REQUEST_ID", error: "사진 업로드 요청을 다시 시작해 주세요.", retryTarget: "photo" }, { status: 400 });
  }
  const supabase = getSupabaseAdminClient() as unknown as DraftUploadClient;
  if (!referenceImageDataUrl) {
    try {
      await ensureUserProfile(userId, supabase);
      const existing = await loadDraft(supabase, userId, clientRequestId);
      if (existing) {
        const reuse = evaluateGenerationDraftReuse(existing);
        if (reuse.reusable) return NextResponse.json(draftResponse(existing, true), { status: 200 });
        return NextResponse.json({ code: reuse.code, error: reuse.message, retryTarget: "photo" }, { status: reuse.status });
      }
      return NextResponse.json({ code: "DRAFT_NOT_REUSABLE", error: "기존 사진 업로드를 찾지 못했습니다. 사진을 다시 선택해 주세요.", retryTarget: "photo" }, { status: 409 });
    } catch (error) {
      console.error("[generation-drafts] Draft reuse check failed", error);
      return NextResponse.json({ code: "DRAFT_REUSE_CHECK_FAILED", error: "사진 업로드 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.", retryTarget: "photo" }, { status: 500 });
    }
  }
  if (referenceImageDataUrl.length > MAX_DATA_URL_LENGTH) {
    return NextResponse.json(
      { code: "IMAGE_TOO_LARGE", error: "사진은 8MB 이하로 선택해 주세요.", retryTarget: "photo" },
      { status: 413 },
    );
  }

  let parsed: ReturnType<typeof parseImageDataUrl>;
  try {
    parsed = parseImageDataUrl(referenceImageDataUrl);
  } catch (error) {
    if (error instanceof ImageUploadRequestError) {
      return NextResponse.json(
        {
          code: error.code,
          error: error.code === "IMAGE_TOO_LARGE"
            ? "사진은 8MB 이하로 선택해 주세요."
            : error.code === "UNSUPPORTED_IMAGE_TYPE"
              ? "JPG, PNG 또는 WebP 사진을 선택해 주세요."
              : "사진 파일을 읽지 못했습니다. 다른 사진을 선택해 주세요.",
          retryTarget: "photo",
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { code: "INVALID_IMAGE_DATA", error: "사진 파일을 읽지 못했습니다. 다른 사진을 선택해 주세요.", retryTarget: "photo" },
      { status: 400 },
    );
  }

  try {
    await ensureUserProfile(userId, supabase);
    const existing = await loadDraft(supabase, userId, clientRequestId);
    if (existing) {
      const reuse = evaluateGenerationDraftReuse(existing);
      if (!reuse.reusable) {
        return NextResponse.json(
          { code: reuse.code, error: reuse.message, retryTarget: "photo" },
          { status: reuse.status },
        );
      }
      return NextResponse.json(draftResponse(existing, true), { status: 200 });
    }

    const storedOriginal = await uploadGenerationOriginalImage(supabase, {
      userId,
      generationId: clientRequestId,
      imageDataUrl: referenceImageDataUrl,
    });
    const expiresAt = new Date(Date.now() + retentionDays * DAY_MS).toISOString();
    const checksum = await sha256Hex(parsed.buffer);
    const { error: registerError } = await supabase.rpc("register_generation_upload_draft", {
      p_draft_id: clientRequestId,
      p_user_id: userId,
      p_client_request_id: clientRequestId,
      p_original_image_path: storedOriginal.path,
      p_content_type: parsed.contentType,
      p_byte_size: parsed.buffer.length,
      p_checksum_sha256: checksum,
      p_expires_at: expiresAt,
    });

    const reconciled = await loadDraft(supabase, userId, clientRequestId).catch(() => null);
    if (reconciled) {
      const reuse = evaluateGenerationDraftReuse(reconciled);
      if (reuse.reusable) {
        return NextResponse.json(draftResponse(reconciled, false), { status: 201 });
      }
    }

    await removeGenerationOriginalImage(supabase, storedOriginal.path).catch((cleanupError) => {
      console.error("[generation-drafts] Failed to remove an unregistered upload", cleanupError);
    });
    throw new Error(registerError?.message || "Draft upload could not be registered");
  } catch (error) {
    console.error("[generation-drafts] Draft upload failed", error);
    return NextResponse.json(
      { code: "DRAFT_UPLOAD_FAILED", error: "사진을 안전하게 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.", retryTarget: "photo" },
      { status: 500 },
    );
  }
}
