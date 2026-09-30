"use client";

import { cn } from "@/shared/utils/cn";

// Control Room v3: chip ala .tag mockup — radius 2px, uppercase, border 1px + tone dim
const variants = {
  default: "border-border text-text-muted",
  primary: "border-brand-500/40 bg-brand-500/10 text-brand-600 dark:text-brand-400",
  success: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  error: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

const sizes = {
  sm: "px-[7px] py-[2px] text-[9.5px]",
  md: "px-[7px] py-[2px] text-[9.5px]",
  lg: "px-2.5 py-1 text-[10.5px]",
};

export default function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  icon,
  className,
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[2px] border font-bold uppercase tracking-[0.08em]",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            variant === "success" && "bg-green-500",
            variant === "warning" && "bg-yellow-500",
            variant === "error" && "bg-red-500",
            variant === "info" && "bg-blue-500",
            variant === "primary" && "bg-brand-500",
            variant === "default" && "bg-gray-500"
          )}
        />
      )}
      {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
      {children}
    </span>
  );
}
