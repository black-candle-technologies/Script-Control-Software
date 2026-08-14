/**
 * Theme: two palettes, one style. The choice lives on <html data-theme> so the
 * CSS variables in App.css switch wholesale, and is remembered in localStorage.
 * With nothing remembered we follow the OS.
 */
import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const KEY = "scs-theme";

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null; // private mode, or storage disabled
  }
}

function preferred(): Theme {
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Read the theme the boot script already applied, falling back the same way. */
export function currentTheme(): Theme {
  const applied = document.documentElement.getAttribute("data-theme");
  return applied === "light" || applied === "dark" ? applied : stored() ?? preferred();
}

/**
 * Applied once at boot by the inline script in index.html, so this only keeps
 * React in sync with what is already on the page.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    // Swap the whole palette in one frame. Without this the hover transitions
    // on individual controls try to interpolate the new variable values and
    // strand them mid-way; it also reads better than cross-fading the app.
    const root = document.documentElement;
    root.classList.add("theme-swap");
    root.setAttribute("data-theme", theme);
    void root.offsetHeight; // flush the new palette with transitions disabled
    root.classList.remove("theme-swap");
  }, [theme]);

  // Follow the OS until the writer picks a side; after that, their choice wins.
  useEffect(() => {
    if (stored()) return;
    const media = matchMedia("(prefers-color-scheme: light)");
    const follow = () => { if (!stored()) setTheme(media.matches ? "light" : "dark"); };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  const toggle = useCallback(() => {
    setTheme((value) => {
      const next: Theme = value === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* the choice just won't survive the session */
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
