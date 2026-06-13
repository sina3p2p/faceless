"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/25 active:scale-[0.97] active:shadow-indigo-500/10",
  secondary:
    "bg-white/8 text-white hover:bg-white/12 border border-white/10 hover:border-white/15 active:scale-[0.97]",
  outline:
    "border border-white/15 text-white/90 hover:bg-white/6 hover:border-white/25 hover:text-white active:scale-[0.97]",
  ghost:
    "text-zinc-400 hover:text-white hover:bg-white/6 active:scale-[0.97]",
  danger:
    "bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-500/20 active:scale-[0.97]",
};

const sizeStyles: Record<Size, string> = {
  sm: "px-3.5 py-1.5 text-sm h-8",
  md: "px-5 py-2.5 text-sm h-9",
  lg: "px-7 py-3 text-[0.9375rem] h-11",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.01em] transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-3.5 w-3.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
