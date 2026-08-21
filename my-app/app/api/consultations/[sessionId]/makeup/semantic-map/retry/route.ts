import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { retryMakeupSemanticMap } from "../../../../../../../lib/makeup/makeup-direction-server";
import { v2Failure } from "../../../../../../../lib/v2/http";

interface Params { params: Promise<{ sessionId: string }> }

export async function POST(_request: Request, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { sessionId } = await params;
  try {
    return NextResponse.json({ semanticMap: await retryMakeupSemanticMap(userId, sessionId) });
  } catch (error) {
    return v2Failure(error);
  }
}
