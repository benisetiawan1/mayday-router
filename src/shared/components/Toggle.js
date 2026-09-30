"use client";

import { cn } from "@/shared/utils/cn";

// Control Room v3: single mockup switch size (.sw in globals.css); size prop kept for API compat.
const TOGGLE_SIZES = { sm: "", md: "", lg: "" };

export default function Toggle({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  size = "md",
  className,
  "aria-label": ariaLabel,
  title,
}) {
  const sizes = TOGGLE_SIZES;

  const handleClick = () => {
    if (!disabled && onChange) onChange(!checked);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || label || title || "Toggle"}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          "sw",
          checked && "on",
          sizes[size],
          disabled && "cursor-not-allowed"
        )}
      />
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-sm font-medium text-text-main">{label}</span>
          )}
          {description && (
            <span className="text-xs text-text-muted">{description}</span>
          )}
        </div>
      )}
    </div>
  );
}
