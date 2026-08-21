import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createConsultationStartContext, deriveEffectiveConsultationIntent, OPTIONAL_OPENING_INTENTS, type OptionalOpeningIntent } from "@hairfit/shared/consulting/start-context";
import { isConsultationZeroInputIntakeEnabled } from "../../../../../../lib/consulting/feature-flag";
import { readServerConsultation, updateServerConsultation } from "../../../../../../lib/consulting/server-store";

interface Params { params: Promise<{ consultationId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isConsultationZeroInputIntakeEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { consultationId } = await params;
  try {
    const snapshot = await readServerConsultation(userId, consultationId);
    if (!snapshot) return NextResponse.json({ error: "상담을 찾지 못했습니다." }, { status: 404 });
    return NextResponse.json({
      startContext: snapshot.startContext,
      effectiveIntent: deriveEffectiveConsultationIntent({ startContext: snapshot.startContext, legacyIntent: snapshot.discovery.intent }),
      version: snapshot.version,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "상담 시작 기준을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isConsultationZeroInputIntakeEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { consultationId } = await params;
  const body = await request.json().catch(() => null) as { expectedVersion?: unknown; optionalOpeningIntent?: unknown; optionalNote?: unknown } | null;
  if (!body || !Number.isInteger(body.expectedVersion)) return NextResponse.json({ error: "expectedVersion이 필요합니다." }, { status: 400 });
  const optionalOpeningIntent = body.optionalOpeningIntent === null || body.optionalOpeningIntent === undefined
    ? null
    : OPTIONAL_OPENING_INTENTS.includes(body.optionalOpeningIntent as OptionalOpeningIntent) ? body.optionalOpeningIntent as OptionalOpeningIntent : undefined;
  if (optionalOpeningIntent === undefined) return NextResponse.json({ error: "지원하지 않는 시작 방향입니다." }, { status: 400 });
  if (body.optionalNote !== undefined && body.optionalNote !== null && typeof body.optionalNote !== "string") return NextResponse.json({ error: "optionalNote 형식이 올바르지 않습니다." }, { status: 400 });
  try {
    const snapshot = await readServerConsultation(userId, consultationId);
    if (!snapshot) return NextResponse.json({ error: "상담을 찾지 못했습니다." }, { status: 404 });
    const startContext = createConsultationStartContext({
      now: new Date().toISOString(),
      optionalOpeningIntent,
      optionalNote: typeof body.optionalNote === "string" ? body.optionalNote : null,
      sourceProfileId: snapshot.discovery.intent?.sourceProfileId ?? null,
      revision: (snapshot.startContext?.revision ?? 0) + 1,
    });
    const result = await updateServerConsultation(userId, consultationId, {
      expectedVersion: Number(body.expectedVersion),
      startContext,
      completeStage: "discovery",
      currentStage: "photo",
    });
    if (result.status === "conflict") return NextResponse.json({ error: "다른 화면에서 상담이 변경되었습니다.", snapshot: result.snapshot }, { status: 409 });
    return NextResponse.json({
      snapshot: result.snapshot,
      startContext,
      effectiveIntent: deriveEffectiveConsultationIntent({ startContext, legacyIntent: result.snapshot.discovery.intent }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "상담 시작 기준을 저장하지 못했습니다.";
    const status = message === "NOT_FOUND" ? 404 : message.startsWith("INVALID_PATCH:") ? 400 : 500;
    return NextResponse.json({ error: message.startsWith("INVALID_PATCH:") ? message.slice("INVALID_PATCH:".length) : message }, { status });
  }
}
