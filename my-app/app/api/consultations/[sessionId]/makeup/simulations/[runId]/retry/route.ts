import { auth } from "@clerk/nextjs/server";
import { after, NextResponse } from "next/server";
import { processMakeupSimulation, retryMakeupSimulation } from "../../../../../../../../lib/makeup/makeup-simulation-server";
import { v2Failure } from "../../../../../../../../lib/v2/http";
export async function POST(_: Request, context: { params: Promise<{ sessionId: string; runId: string }> }) { const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }); const { sessionId, runId } = await context.params; try { const run = await retryMakeupSimulation(userId, sessionId, runId); after(() => processMakeupSimulation(userId, sessionId, run.id)); return NextResponse.json({ run }, { status: 202 }); } catch (error) { return v2Failure(error); } }
