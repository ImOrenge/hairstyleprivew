"use client";

import Link from "next/link";
import { useAuth, UserButton } from "@clerk/nextjs";
import { useT } from "../../lib/i18n/useT";
import { loginButtonClassName, signupButtonClassName } from "./authButtonStyles";

/**
 * Handles auth buttons with graceful fallback.
 * - Clerk loading / error → plain link buttons (always visible)
 * - Clerk loaded, signed out → Clerk-powered buttons
 * - Clerk loaded, signed in → UserButton
 */
export function ClerkAuthButtons() {
    const t = useT();
    const { isLoaded, isSignedIn } = useAuth();

    // Clerk loaded & user signed in → show avatar
    if (isLoaded && isSignedIn) {
        return <UserButton />;
    }

    // Clerk loaded & user NOT signed in → go to dedicated auth routes
    if (isLoaded && !isSignedIn) {
        return (
            <>
                <Link
                    href="/login"
                    className={loginButtonClassName}
                >
                    {t("nav.login")}
                </Link>
                <Link
                    href="/signup"
                    className={signupButtonClassName}
                >
                    {t("nav.signup")}
                </Link>
            </>
        );
    }

    // Clerk NOT loaded (still loading or API error) → plain link fallback
    return (
        <>
            <Link
                href="/login"
                className={loginButtonClassName}
            >
                {t("nav.login")}
            </Link>
            <Link
                href="/signup"
                className={signupButtonClassName}
            >
                {t("nav.signup")}
            </Link>
        </>
    );
}
