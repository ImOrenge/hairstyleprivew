import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { PERSONAL_COLOR_TRAINING_CONSENT_VERSION, readPersonalColorTrainingConsent, writePersonalColorTrainingConsent } from "../../../../../../lib/personal-color-training-consent-server";
import { isHairfitV2Enabled } from "../../../../../../lib/v2/feature-flags";
import { v2Failure } from "../../../../../../lib/v2/http";

interface Params { params: Promise<{ sessionId: string }> }
const disabled = () => !isHairfitV2Enabled("PERSONAL_COLOR_V2_READ") ? NextResponse.json({ error: "Not found" }, { status: 404 }) : null;

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const off = disabled(); if (off) return off;
  try { return NextResponse.json(await readPersonalColorTrainingConsent(userId, (await params).sessionId)); }
  catch (error) { return v2Failure(error); }
}

export async function PUT(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const off = disabled(); if (off) return off;
  const body = (await request.json().catch(() => null)) as { accepted?: boolean; consentVersion?: string; idempotencyKey?: string } | null;
  if (!body || body.accepted !== true || body.consentVersion !== PERSONAL_COLOR_TRAINING_CONSENT_VERSION || !body.idempotencyKey) return NextResponse.json({ error: "명시적 학습 동의가 필요합니다." }, { status: 400 });
  try { return NextResponse.json(await writePersonalColorTrainingConsent({ userId, consultationId: (await params).sessionId, action: "granted", consentVersion: body.consentVersion, idempotencyKey: body.idempotencyKey })); }
  catch (error) { return v2Failure(error); }
}

export async function DELETE(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const off = disabled(); if (off) return off;
  const body = (await request.json().catch(() => null)) as { consentVersion?: string; idempotencyKey?: string } | null;
  if (!body || body.consentVersion !== PERSONAL_COLOR_TRAINING_CONSENT_VERSION || !body.idempotencyKey) return NextResponse.json({ error: "동의 철회 요청이 올바르지 않습니다." }, { status: 400 });
  try { return NextResponse.json(await writePersonalColorTrainingConsent({ userId, consultationId: (await params).sessionId, action: "revoked", consentVersion: body.consentVersion, idempotencyKey: body.idempotencyKey })); }
  catch (error) { return v2Failure(error); }
}
