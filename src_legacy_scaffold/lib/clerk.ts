export function isClerkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export function getClerkSignInPath() {
  return "/login";
}

export function getClerkSignUpPath() {
  return "/signup";
}
