import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { dispatchMakeupRationale, readCurrentMakeupRationale, retryCurrentMakeupRationale } from "../../../../../../../lib/makeup/makeup-interview-server";
import { v2Failure } from "../../../../../../../lib/v2/http";
interface Params { params: Promise<{ sessionId: string }> }
async function owner(params: Params) { const { userId } = await auth(); return { userId, sessionId: (await params.params).sessionId }; }
export async function GET(_request: Request, context: Params) { const value = await owner(context); if (!value.userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }); try { return NextResponse.json({ rationaleAi: await readCurrentMakeupRationale(value.userId, value.sessionId) }); } catch (error) { return v2Failure(error); } }
export async function POST(_request: Request, context: Params) { const value = await owner(context); if (!value.userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }); try { return NextResponse.json({ rationaleAi: await dispatchMakeupRationale(value.userId, value.sessionId) }); } catch (error) { return v2Failure(error); } }
export async function PUT(_request: Request, context: Params) { const value = await owner(context); if (!value.userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }); try { return NextResponse.json({ rationaleAi: await retryCurrentMakeupRationale(value.userId, value.sessionId) }); } catch (error) { return v2Failure(error); } }
