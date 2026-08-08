export class HairfitV2Error extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); this.name = "HairfitV2Error"; }
}

export function v2ErrorResponse(error: unknown) {
  if (error instanceof HairfitV2Error) return { status: error.status, body: { error: error.message, code: error.code } };
  return { status: 500, body: { error: "요청을 처리하지 못했습니다.", code: "HAIRFIT_V2_INTERNAL" } };
}
