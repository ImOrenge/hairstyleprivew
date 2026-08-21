import { auth } from "@clerk/nextjs/server";
import { after, NextResponse } from "next/server";
import { getHairColorGenerationV2, processHairColorGenerationV2, queueHairColorGenerationV2, type HairColorGenerationInputV1, type HairColorGenerationPurposeV1 } from "../../../../../../../lib/consulting/color-studio-server";
import type { HairColorCandidateKey } from "../../../../../../../lib/consulting/color-preview-candidates";
import { v2Failure } from "../../../../../../../lib/v2/http";
import { isColorStudioEnabled } from "../../../../../../../lib/consulting/feature-flag";

interface Params { params: Promise<{ consultationId: string }> }
export async function GET(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isColorStudioEnabled()) return NextResponse.json({ error: "Color Studio is disabled." }, { status: 404 });
  const { consultationId } = await params; const searchParams = new URL(request.url).searchParams; const runId = searchParams.get("runId") || undefined;
  const purposeValue = searchParams.get("purpose");
  const purpose = purposeValue === "exploration" || purposeValue === "final" ? purposeValue as HairColorGenerationPurposeV1 : undefined;
  const candidateValue = searchParams.get("candidateKey");
  const candidateKey = candidateValue === "best-match" || candidateValue === "natural" || candidateValue === "accent" ? candidateValue as HairColorCandidateKey : undefined;
  if (purposeValue && !purpose) return NextResponse.json({ error: "탐색 또는 최종 생성 목적을 확인해 주세요." }, { status: 400 });
  if (candidateValue && !candidateKey) return NextResponse.json({ error: "컬러 후보를 다시 선택해 주세요." }, { status: 400 });
  try { const run = await getHairColorGenerationV2(userId, consultationId, runId, purpose, candidateKey); if (run?.state === "queued") after(() => processHairColorGenerationV2(userId, String(run.id))); return run ? NextResponse.json({ run }) : NextResponse.json({ error: "생성 작업이 없습니다." }, { status: 404 }); } catch (error) { return v2Failure(error); }
}
export async function POST(request: Request, { params }: Params) {
  const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!isColorStudioEnabled()) return NextResponse.json({ error: "Color Studio is disabled." }, { status: 404 });
  const { consultationId } = await params; const body = await request.json().catch(() => null) as HairColorGenerationInputV1 | null;
  if (!body) return NextResponse.json({ error: "컬러 생성 입력이 필요합니다." }, { status: 400 });
  try { const queued = await queueHairColorGenerationV2(userId, consultationId, body); if (queued.state === "queued") after(() => processHairColorGenerationV2(userId, String(queued.id))); const run = await getHairColorGenerationV2(userId, consultationId, String(queued.id)); return NextResponse.json({ run: run ?? queued }, { status: 202 }); } catch (error) { return v2Failure(error); }
}
