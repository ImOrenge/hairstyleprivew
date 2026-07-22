import {
  mapAuthFormError,
  validateLoginFields,
  validateSignupFields,
} from "../lib/auth-form";

describe("auth form contracts", () => {
  test("returns every missing login field and the first focus target", () => {
    expect(validateLoginFields({ email: " ", password: "" })).toEqual({
      errors: {
        email: "이메일을 입력해 주세요.",
        password: "비밀번호를 입력해 주세요.",
      },
      firstInvalidField: "email",
    });
  });

  test("accepts populated login fields", () => {
    expect(validateLoginFields({ email: "member@hairfit.test", password: "secret" })).toEqual({
      errors: {},
      firstInvalidField: null,
    });
  });

  test("validates the email code independently after signup starts verification", () => {
    expect(validateSignupFields({ code: "", email: "saved@test.dev", needsCode: true, password: "saved" }))
      .toEqual({
        errors: { code: "이메일로 받은 인증 코드를 입력해 주세요." },
        firstInvalidField: "code",
      });
  });

  test.each([
    ["form_identifier_not_found", "identifier", "email", "이메일 주소를 확인하고 다시 입력해 주세요."],
    ["form_password_incorrect", "password", "password", "비밀번호를 확인하고 다시 입력해 주세요."],
    ["form_code_incorrect", "code", "code", "인증 코드가 올바른지 확인하고 다시 입력해 주세요."],
  ])("maps %s without exposing provider text", (code, paramName, field, message) => {
    expect(mapAuthFormError({
      errors: [{
        code,
        longMessage: "provider detail that must not reach the user",
        meta: { paramName },
      }],
    }, "안전한 기본 오류"))
      .toEqual({ field, message });
  });

  test("uses a safe fallback for unclassified provider failures", () => {
    expect(mapAuthFormError(new Error("raw network details"), "로그인에 실패했습니다."))
      .toEqual({ field: null, message: "로그인에 실패했습니다." });
  });
});
