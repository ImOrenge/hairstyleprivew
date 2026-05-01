"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../providers/ThemeProvider";
import { Button } from "../ui/Button";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    // Avoid hydration mismatch
    React.useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Theme is resolved on the client after hydration.
        setMounted(true);
    }, []);

    if (!mounted) return <div className="h-10 w-10" />;

    return (
        <Button
            variant="secondary"
            className="h-10 w-10 rounded-[var(--app-radius-control)] bg-[var(--app-surface)] p-0 hover:bg-[var(--app-surface-muted)]"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
        >
            {theme === "dark" ? (
                <Sun className="h-[1.2rem] w-[1.2rem] text-[var(--app-accent)] transition-all" />
            ) : (
                <Moon className="h-[1.2rem] w-[1.2rem] text-[var(--app-text)] transition-all" />
            )}
        </Button>
    );
}
