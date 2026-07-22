import {
  isRefundOutcome,
  isRefundReasonCategory,
  type RefundInterviewAnswers,
} from "@hairfit/shared";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createRefundQuote } from "../../../../lib/refund-automation";
import { isSupabaseConfigured } from "../../../../lib/supabase";

interface Body {
  paymentTransactionId?: unknown;
  outcome?: unknown;
  reasonCategory?: unknown;
  answers?: unknown;
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseAnswers(value: unknown): RefundInterviewAnswers | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const detail = text(data.detail, 500);
  if (detail.length < 5) return null;
  return {
    detail,
    experiencedAt: text(data.experiencedAt, 40) || null,
    affectedFeature: text(data.affectedFeature, 80) || null,
  };
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const paymentTransactionId = text(body.paymentTransactionId, 80);
  const answers = parseAnswers(body.answers);
  if (!paymentTransactionId || !isRefundOutcome(body.outcome)) {
    return NextResponse.json({ error: "환불 방식과 결제 정보를 확인해 주세요." }, { status: 400 });
  }
  if (!isRefundReasonCategory(body.reasonCategory) || !answers) {
    return NextResponse.json({ error: "환불 사유를 선택하고 상세 내용을 5자 이상 입력해 주세요." }, { status: 400 });
  }

  try {
    const quote = await createRefundQuote(userId, {
      paymentTransactionId,
      outcome: body.outcome,
      reasonCategory: body.reasonCategory,
      answers,
    });
    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "환불 견적을 만들지 못했습니다.";
    return NextResponse.json({ error: message }, { status: message.includes("찾지 못") ? 404 : 409 });
  }
}
