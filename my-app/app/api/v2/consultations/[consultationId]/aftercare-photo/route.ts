import { auth } from "@clerk/nextjs/server";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { loadSharp } from "../../../../../../lib/sharp-loader.ts";
import { getSupabaseAdminClient } from "../../../../../../lib/supabase";
import { v2Disabled, v2Failure } from "../../../../../../lib/v2/http";

const AFTERCARE_PHOTO_BUCKET = "aftercare-photos";
const MAX_AFTERCARE_PHOTO_BYTES = 8_000_000;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface Params { params: Promise<{ consultationId: string }> }

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const disabled = v2Disabled("CONSULTATION_SESSION_V2_ENABLED", "SALON_BRIEF_V2_ENABLED");
  if (disabled) return disabled;

  const { consultationId } = await params;
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const actualServiceId = String(formData?.get("actualServiceId") ?? "").trim();
  const consent = formData?.get("consent") === "true";
  if (!(file instanceof File) || !actualServiceId || !consent) {
    return NextResponse.json({ error: "시술 후 사진, 실제 시술 기록, 사진 사용 동의를 확인해 주세요." }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: "JPEG, PNG, WebP 이미지만 업로드할 수 있습니다." }, { status: 400 });
  }
  if (file.size > MAX_AFTERCARE_PHOTO_BYTES) {
    return NextResponse.json({ error: "이미지 용량이 너무 큽니다. 8MB 이하 파일을 사용해 주세요." }, { status: 400 });
  }

  try {
    const sharp = await loadSharp();
    const db = getSupabaseAdminClient();
    const current = await db
      .from("actual_services_v2")
      .select("id,after_photo_path")
      .eq("id", actualServiceId)
      .eq("consultation_id", consultationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) {
      return NextResponse.json({ error: "사진을 연결할 실제 시술 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    const input = Buffer.from(await file.arrayBuffer());
    const output = await sharp(input)
      .rotate()
      .resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();
    const fingerprint = sha256(output);
    const ownerPrefix = sha256(userId).slice(0, 32);
    const objectPath = `${ownerPrefix}/${consultationId}/${actualServiceId}/${fingerprint}.webp`;
    const upload = await db.storage.from(AFTERCARE_PHOTO_BUCKET).upload(objectPath, output, {
      contentType: "image/webp",
      upsert: true,
    });
    if (upload.error) throw new Error(upload.error.message);

    const uploadedAt = new Date().toISOString();
    const updated = await db
      .from("actual_services_v2")
      .update({
        after_photo_path: objectPath,
        after_photo_fingerprint: fingerprint,
        after_photo_consent_at: uploadedAt,
      })
      .eq("id", actualServiceId)
      .eq("consultation_id", consultationId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (updated.error || !updated.data) {
      await db.storage.from(AFTERCARE_PHOTO_BUCKET).remove([objectPath]);
      throw new Error(updated.error?.message || "실제 시술 사진 연결에 실패했습니다.");
    }

    const previousPath = (current.data as { after_photo_path?: unknown }).after_photo_path;
    if (typeof previousPath === "string" && previousPath && previousPath !== objectPath) {
      const cleanup = await db.storage.from(AFTERCARE_PHOTO_BUCKET).remove([previousPath]);
      if (cleanup.error) {
        console.warn("[aftercare-photo] Previous photo cleanup was deferred", {
          actualServiceId,
          error: cleanup.error.message,
        });
      }
    }

    return NextResponse.json({
      photo: { actualServiceId, fingerprint, uploadedAt },
    });
  } catch (error) {
    return v2Failure(error);
  }
}
