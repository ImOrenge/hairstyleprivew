"use client";

import * as React from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeProviderProps = {
  children: React.ReactNode;
  attribute?: "class" | `data-${string}` | Array<"class" | `data-${string}`>;
  defaultTheme?: Theme;
  disableTransitionOnChange?: boolean;
  enableColorScheme?: boolean;
  enableSystem?: boolean;
  forcedTheme?: Theme;
  scriptProps?: React.ScriptHTMLAttributes<HTMLScriptElement> & Partial<Record<`data-${string}`, string>>;
  storageKey?: string;
  themes?: ResolvedTheme[];
};

type ThemeContextValue = {
  forcedTheme?: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
  systemTheme: ResolvedTheme;
  theme: Theme;
  themes: Theme[];
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const DEFAULT_THEMES: ResolvedTheme[] = ["light", "dark"];

const themeBootstrapScript = String.raw`
try {
  var theme = localStorage.getItem("theme") || "system";
  var resolved = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  var root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
} catch (error) {}
`;

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(storageKey: string, defaultTheme: Theme): Theme {
  if (typeof window === "undefined") {
    return defaultTheme;
  }

  try {
    const storedTheme = window.localStorage.getItem(storageKey);
    return storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
      ? storedTheme
      : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

function disableTransitions() {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{transition:none!important;-webkit-transition:none!important}",
    ),
  );
  document.head.appendChild(style);

  return () => {
    window.getComputedStyle(document.body);
    setTimeout(() => {
      document.head.removeChild(style);
    }, 1);
  };
}

export function useTheme() {
  return React.useContext(ThemeContext) ?? {
    forcedTheme: undefined,
    resolvedTheme: "light" as const,
    setTheme: () => undefined,
    systemTheme: "light" as const,
    theme: "system" as const,
    themes: ["light", "dark", "system"] as Theme[],
  };
}

export function ThemeProvider({
  attribute = "class",
  children,
  defaultTheme = "system",
  disableTransitionOnChange = false,
  enableColorScheme = true,
  enableSystem = true,
  forcedTheme,
  scriptProps,
  storageKey = "theme",
  themes = DEFAULT_THEMES,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => getStoredTheme(storageKey, defaultTheme));
  const [systemTheme, setSystemTheme] = React.useState<ResolvedTheme>(() => getSystemTheme());
  const availableThemes = React.useMemo<Theme[]>(
    () => (enableSystem ? [...themes, "system"] : themes),
    [enableSystem, themes],
  );

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setSystemTheme(getSystemTheme());

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  React.useEffect(() => {
    const activeTheme = forcedTheme ?? theme;
    const resolvedTheme = activeTheme === "system" && enableSystem ? systemTheme : activeTheme;

    if (resolvedTheme !== "light" && resolvedTheme !== "dark") {
      return;
    }

    const restoreTransitions = disableTransitionOnChange ? disableTransitions() : null;
    const root = document.documentElement;
    const attributes = Array.isArray(attribute) ? attribute : [attribute];

    attributes.forEach((currentAttribute) => {
      if (currentAttribute === "class") {
        root.classList.remove(...themes);
        root.classList.add(resolvedTheme);
        return;
      }

      root.setAttribute(currentAttribute, resolvedTheme);
    });

    if (enableColorScheme) {
      root.style.colorScheme = resolvedTheme;
    }

    restoreTransitions?.();
  }, [
    attribute,
    disableTransitionOnChange,
    enableColorScheme,
    enableSystem,
    forcedTheme,
    systemTheme,
    theme,
    themes,
  ]);

  const setTheme = React.useCallback<React.Dispatch<React.SetStateAction<Theme>>>(
    (nextTheme) => {
      setThemeState((currentTheme) => {
        const resolvedNextTheme =
          typeof nextTheme === "function" ? nextTheme(currentTheme) : nextTheme;

        try {
          window.localStorage.setItem(storageKey, resolvedNextTheme);
        } catch {}

        return resolvedNextTheme;
      });
    },
    [storageKey],
  );

  const resolvedTheme = theme === "system" && enableSystem ? systemTheme : theme;
  const contextValue = React.useMemo<ThemeContextValue>(
    () => ({
      forcedTheme,
      resolvedTheme: resolvedTheme === "dark" ? "dark" : "light",
      setTheme,
      systemTheme,
      theme,
      themes: availableThemes,
    }),
    [availableThemes, forcedTheme, resolvedTheme, setTheme, systemTheme, theme],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <script
        {...scriptProps}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
      />
      {children}
    </ThemeContext.Provider>
  );
}
