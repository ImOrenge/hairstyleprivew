import * as AuthSession from "expo-auth-session";

export const MOBILE_SSO_SCHEME = "hairfit";
export const MOBILE_SSO_CALLBACK_PATH = "sso-callback";

/**
 * Keep the native OAuth callback independent from the login and signup routes.
 * The same full URL must be allowlisted in Clerk's mobile SSO settings.
 */
export function createMobileSsoRedirectUrl() {
  return AuthSession.makeRedirectUri({
    scheme: MOBILE_SSO_SCHEME,
    path: MOBILE_SSO_CALLBACK_PATH,
  });
}
