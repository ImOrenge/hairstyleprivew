import * as AuthSession from "expo-auth-session";
import {
  createMobileSsoRedirectUrl,
  MOBILE_SSO_CALLBACK_PATH,
  MOBILE_SSO_SCHEME,
} from "../lib/mobile-sso";

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: jest.fn(() => "hairfit://sso-callback"),
}));

describe("mobile Google SSO redirect", () => {
  test("uses the app scheme and a dedicated callback route", () => {
    expect(createMobileSsoRedirectUrl()).toBe("hairfit://sso-callback");
    expect(AuthSession.makeRedirectUri).toHaveBeenCalledWith({
      scheme: MOBILE_SSO_SCHEME,
      path: MOBILE_SSO_CALLBACK_PATH,
    });
  });
});
