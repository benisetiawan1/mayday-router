"use client";

import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";

const THEME_VARIANTS = {
  default: "tbtn",
  card: cn(
    "flex items-center justify-center size-11 rounded-[3px]",
    "bg-surface/60 hover:bg-surface",
    "border border-border",
    "text-text-muted hover:text-brand-500",
    "transition-all group"
  ),
};

export default function ThemeToggle({ className, variant = "default" }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button type="button"
      onClick={toggleTheme}
      className={cn(THEME_VARIANTS[variant], className)}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <span
        className={cn(
          "material-symbols-outlined text-[18px]",
          variant === "card" && "transition-transform duration-300 group-hover:rotate-12"
        )}
      >
        contrast
      </span>
    </button>
  );
}
