"use client";

import { cn } from "@/shared/utils/cn";

// Control Room v3: .seg mockup — flat buttons in bordered track
const SEGMENT_SIZES = {
  sm: "text-[10.5px] px-[10px] py-[5px]",
  md: "text-[10.5px] px-[10px] py-[5px]",
  lg: "text-[11.5px] px-3 py-[7px]",
};

const EMPTY_OPTIONS = [];

export default function SegmentedControl({
  options = EMPTY_OPTIONS,
  value,
  onChange,
  size = "md",
  className,
}) {

  return (
    <div
      className={cn(
        "inline-flex items-center overflow-x-auto",
        "rounded-[3px] border border-border bg-bg",
        className
      )}
    >
      {options.map((option) => (
        <button type="button"
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "shrink-0 font-medium uppercase tracking-[0.08em] transition-all",
            SEGMENT_SIZES[size],
            value === option.value
              ? "bg-primary text-white font-bold"
              : "text-text-muted hover:text-text-main"
          )}
        >
          {option.icon && (
            <span className="material-symbols-outlined text-[16px] mr-1.5">
              {option.icon}
            </span>
          )}
          {option.label}
        </button>
      ))}
    </div>
  );
}
