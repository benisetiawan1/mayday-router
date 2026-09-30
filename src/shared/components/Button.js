"use client";

import { cn } from "@/shared/utils/cn";

// Control Room v3: base look comes from .btn in globals.css; variants map onto it.
const variants = {
  primary: "primary",
  secondary: "",
  outline: "",
  ghost: "ghost",
  danger: "danger",
  success: "bg-green-600 hover:bg-green-700 !text-white border-transparent",
};

const sizes = {
  sm: "", // .btn default = 28px mockup size
  md: "h-8 px-4",
  lg: "h-9 px-5",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  className,
  ...props
}) {
  return (
    <button type="button"
      className={cn(
        "btn",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
      ) : icon ? (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && (
        <span className="material-symbols-outlined text-[18px]">{iconRight}</span>
      )}
    </button>
  );
}
