import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSupabaseAdminClient } from "../../../../lib/supabase";
import {
  BODY_PHOTO_BUCKET,
  createSignedUrl,
  ensureCurrentUserProfile,
  normalizeStyleProfile,
  type ServerSupabaseLike,
} from "../../../../lib/style-profile-server";

const MAX_BODY_PHOTO_BYTES = 8_000_000;

async function readExistingProfile(supabase: ServerSupabaseLike, userId: string) {
  const { data, error } = await supabase
    .from("user_style_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeStyleProfile(data, userId);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "file must be an image" }, { status: 400 });
  }
  if (file.size > MAX_BODY_PHOTO_BYTES) {
    return NextResponse.json({ error: "file is too large" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient() as unknown as ServerSupabaseLike;
  const ensured = await ensureCurrentUserProfile(userId, supabase);
  if (ensured.error) {
    return NextResponse.json({ error: ensured.error.message }, { status: 500 });
  }

  try {
    const existing = await readExistingProfile(supabase, userId);
    const input = Buffer.from(await file.arrayBuffer());
    const output = await sharp(input)
      .rotate()
      .resize({ width: 1400, height: 1800, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();

    const objectPath = `${userId}/${Date.now()}-body.webp`;
    const { error: uploadError } = await supabase.storage
      .from(BODY_PHOTO_BUCKET)
      .upload(objectPath, output, {
        contentType: "image/webp",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    if (existing.bodyPhotoPath && existing.bodyPhotoPath !== objectPath) {
      await supabase.storage.from(BODY_PHOTO_BUCKET).remove([existing.bodyPhotoPath]);
    }

    const { data, error } = await supabase
      .from("user_style_profiles")
      .upsert(
        {
          user_id: userId,
          body_photo_path: objectPath,
          body_photo_consent_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const profile = normalizeStyleProfile(data, userId);
    profile.bodyPhotoUrl = await createSignedUrl(supabase, BODY_PHOTO_BUCKET, profile.bodyPhotoPath);

    return NextResponse.json({ profile }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient() as unknown as ServerSupabaseLike;
  try {
    const existing = await readExistingProfile(supabase, userId);
    if (existing.bodyPhotoPath) {
      await supabase.storage.from(BODY_PHOTO_BUCKET).remove([existing.bodyPhotoPath]);
    }

    const { data, error } = await supabase
      .from("user_style_profiles")
      .upsert(
        {
          user_id: userId,
          body_photo_path: null,
          body_photo_consent_at: null,
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: normalizeStyleProfile(data, userId) }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
