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
        setMounted(true);
    }, []);

    if (!mounted) return <div className="w-10 h-10" />;

    return (
        <Button
            variant="secondary"
            className="h-10 w-10 rounded-full bg-white/10 p-0 hover:bg-white/20 dark:bg-zinc-800/50 dark:hover:bg-zinc-700/50"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
        >
            {theme === "dark" ? (
                <Sun className="h-[1.2rem] w-[1.2rem] text-yellow-500 transition-all" />
            ) : (
                <Moon className="h-[1.2rem] w-[1.2rem] text-slate-700 transition-all" />
            )}
        </Button>
    );
}
