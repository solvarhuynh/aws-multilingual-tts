import { useLayoutEffect } from "react";
import type { ThemeMode } from "../lib/types";

export function useTheme(mode: ThemeMode) {
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const dark = mode === "dark" || (mode === "system" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#000000" : "#edf4f9");
    };
    update();
    if (mode === "system") media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [mode]);
}
