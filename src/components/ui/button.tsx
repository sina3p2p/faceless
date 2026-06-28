"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.01em] whitespace-nowrap transition-all duration-150 outline-none cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 active:not-aria-[disabled]:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/85 shadow-lg shadow-primary/20 active:shadow-primary/10",
        secondary:
          "bg-muted text-foreground hover:bg-muted/80 border border-border hover:border-border/80",
        outline:
          "border border-border text-foreground/90 hover:bg-muted hover:border-border/80 hover:text-foreground",
        ghost:
          "text-muted-foreground hover:text-foreground hover:bg-muted",
        destructive:
          "bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-500/20",
        glass:
          "glass-base text-foreground/90 hover:bg-white/10 hover:text-foreground",
        danger:
          "bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-500/20",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "px-3.5 py-1.5 text-sm h-8",
        default: "px-5 py-2.5 text-sm h-9",
        lg: "px-7 py-3 text-[0.9375rem] h-11",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

interface ButtonProps
  extends ButtonPrimitive.Props,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading && (
        <svg className="animate-spin size-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
