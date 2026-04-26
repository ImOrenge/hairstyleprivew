"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useT } from "../../lib/i18n/useT";
import { loginButtonClassName, signupButtonClassName } from "./authButtonStyles";

export function ClerkAuthButtons() {
  const { isLoaded, isSignedIn } = useAuth();

  if (isLoaded && isSignedIn) {
    return <UserButton />;
  }

  return <AuthLinks />;
}

export function AuthLinks() {
  const t = useT();

  return (
    <>
      <Link href="/login" className={loginButtonClassName}>
        {t("nav.login")}
      </Link>
      <Link href="/signup" className={signupButtonClassName}>
        {t("nav.signup")}
      </Link>
    </>
  );
}
