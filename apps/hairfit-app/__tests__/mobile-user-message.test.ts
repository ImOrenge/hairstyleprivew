import { mapMobileUserError } from "../lib/mobile-user-message";

describe("mobile user-safe errors", () => {
  test.each([
    [{ status: 401 }, "로그인이 만료되었습니다."],
    [{ status: 403 }, "이 작업을 수행할 권한이 없습니다."],
    [{ status: 413 }, "사진 용량이 너무 큽니다."],
    [{ status: 415 }, "JPEG, PNG, WebP"],
    [{ status: 429 }, "요청이 많아"],
    [{ status: 503 }, "서버에서 요청을 처리하지 못했습니다."],
    [{ name: "TypeError" }, "네트워크 연결을 확인"],
  ])("maps known failures without returning raw details", (error, expected) => {
    expect(mapMobileUserError(
      { ...error, message: "private server detail" },
      "안전한 기본 문구",
      "photo",
    )).toContain(expected);
  });

  test("uses the caller-owned safe fallback for unknown failures", () => {
    expect(mapMobileUserError(new Error("private server detail"), "다시 시도해 주세요."))
      .toBe("다시 시도해 주세요.");
  });
});
