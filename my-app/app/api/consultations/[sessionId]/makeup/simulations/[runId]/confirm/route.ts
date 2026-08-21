import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { confirmMakeupSimulation } from "../../../../../../../../lib/makeup/makeup-simulation-server";
import { v2Failure } from "../../../../../../../../lib/v2/http";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string; runId: string }> }) { const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }); const { sessionId, runId } = await context.params; const body = await request.json().catch(() => null) as { outputId?: string } | null; if (!body?.outputId) return NextResponse.json({ error: "outputId가 필요합니다." }, { status: 400 }); try { return NextResponse.json({ selection: await confirmMakeupSimulation(userId, sessionId, runId, body.outputId) }); } catch (error) { return v2Failure(error); } }
