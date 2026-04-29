"use client";

import Link from "next/link";
import type { MouseEventHandler } from "react";
import { useClerkAvailable } from "../providers/ClerkAvailabilityProvider";
import { AuthLinks, ClerkAuthButtons, MobileClerkAuthButtons, MobileClerkSignupMenuLink } from "./ClerkAuthButtons";
import { loginButtonClassName } from "./authButtonStyles";

export function HeaderAuthSlot() {
  const hasClerkProvider = useClerkAvailable();

  if (!hasClerkProvider) {
    return <AuthLinks />;
  }

  return <ClerkAuthButtons />;
}

export function MobileHeaderAuthSlot() {
  const hasClerkProvider = useClerkAvailable();

  if (!hasClerkProvider) {
    return (
      <Link href="/login" className={loginButtonClassName}>
        로그인
      </Link>
    );
  }

  return <MobileClerkAuthButtons />;
}

interface MobileSignupMenuLinkProps {
  className: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export function MobileSignupMenuLink({ className, onClick }: MobileSignupMenuLinkProps) {
  const hasClerkProvider = useClerkAvailable();

  if (!hasClerkProvider) {
    return (
      <Link href="/signup" onClick={onClick} className={className}>
        회원가입
      </Link>
    );
  }

  return <MobileClerkSignupMenuLink className={className} onClick={onClick} />;
}
