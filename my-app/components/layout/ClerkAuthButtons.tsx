"use client";

import Link from "next/link";
import { useAuth, UserButton } from "@clerk/nextjs";
import { useT } from "../../lib/i18n/useT";

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
                    className="rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold hover:bg-gray-100"
                >
                    {t("nav.login")}
                </Link>
                <Link
                    href="/signup"
                    className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800"
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
                className="rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold hover:bg-gray-100"
            >
                {t("nav.login")}
            </Link>
            <Link
                href="/signup"
                className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800"
            >
                {t("nav.signup")}
            </Link>
        </>
    );
}
