export type GenerationDraftReuseCode = "DRAFT_EXPIRED" | "DRAFT_NOT_REUSABLE";

export type GenerationDraftReuseDecision =
  | { reusable: true }
  | { reusable: false; code: GenerationDraftReuseCode; status: 409 | 410; message: string };

interface GenerationDraftReuseRow {
  id?: unknown;
  client_request_id?: unknown;
  state?: unknown;
  original_image_path?: unknown;
  uploaded_at?: unknown;
  expires_at?: unknown;
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function evaluateGenerationDraftReuse(
  row: GenerationDraftReuseRow,
  nowMs = Date.now(),
): GenerationDraftReuseDecision {
  const state = typeof row.state === "string" ? row.state.trim().toLowerCase() : "";
  const expiresAt = typeof row.expires_at === "string" ? Date.parse(row.expires_at) : Number.NaN;
  if (state === "expired" || (Number.isFinite(expiresAt) && expiresAt <= nowMs)) {
    return {
      reusable: false,
      code: "DRAFT_EXPIRED",
      status: 410,
      message: "사진 업로드 보존 시간이 끝났습니다. 사진을 다시 업로드해 주세요.",
    };
  }

  const reusable = (state === "ready" || state === "accepted")
    && nonEmptyString(row.id)
    && nonEmptyString(row.client_request_id)
    && nonEmptyString(row.original_image_path)
    && nonEmptyString(row.uploaded_at)
    && Number.isFinite(expiresAt)
    && expiresAt > nowMs;

  return reusable
    ? { reusable: true }
    : {
        reusable: false,
        code: "DRAFT_NOT_REUSABLE",
        status: 409,
        message: "기존 사진 업로드를 다시 사용할 수 없습니다. 사진을 다시 업로드해 주세요.",
      };
}

export interface GenerationDraftUploadAttempt {
  response: { ok: boolean; status?: number };
  data: { code?: string; [key: string]: unknown };
}

export async function uploadGenerationDraftWithSingleRecovery(input: {
  initialClientRequestId: string;
  createFreshClientRequestId: () => string;
  postDraft: (clientRequestId: string) => Promise<GenerationDraftUploadAttempt>;
}) {
  const first = await input.postDraft(input.initialClientRequestId);
  if (first.response.ok || !["DRAFT_EXPIRED", "DRAFT_NOT_REUSABLE"].includes(first.data.code ?? "")) {
    return first;
  }
  return input.postDraft(input.createFreshClientRequestId());
}
