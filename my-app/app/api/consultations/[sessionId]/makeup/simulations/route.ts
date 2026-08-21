import { auth } from "@clerk/nextjs/server";
import { after, NextResponse } from "next/server";
import { isMakeupStyleSimulationEnabled } from "../../../../../../lib/consulting/feature-flag";
import { processMakeupSimulation, queueMakeupSimulation, readMakeupSimulation } from "../../../../../../lib/makeup/makeup-simulation-server";
import { v2Failure } from "../../../../../../lib/v2/http";
interface Params { params: Promise<{ sessionId: string }> }
export async function GET(_: Request, { params }: Params) { const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }); const { sessionId } = await params; try { return NextResponse.json(await readMakeupSimulation(userId, sessionId)); } catch (error) { return v2Failure(error); } }
export async function POST(_: Request, { params }: Params) { const { userId } = await auth(); if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }); if (!isMakeupStyleSimulationEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 }); const { sessionId } = await params; try { const run = await queueMakeupSimulation(userId, sessionId); if (run.state === "queued") after(() => processMakeupSimulation(userId, sessionId, run.id)); return NextResponse.json({ run }, { status: 202 }); } catch (error) { return v2Failure(error); } }
