import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const cardVariants = cva(
  "group/card relative flex flex-col overflow-hidden rounded-2xl text-sm text-card-foreground",
  {
    variants: {
      variant: {
        flat:     "border border-white/8",
        default:  "border border-white/8 bg-white/3 backdrop-blur-sm",
        raised:   "glass-base",
        panel:    "bg-card border border-white/10 [box-shadow:0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.055)]",
        "panel-dark": "bg-[oklch(0.13_0.003_260)] border border-white/10 [box-shadow:0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.055)]",
      },
      padding: {
        none: "",
        sm:   "gap-3 py-3",
        md:   "gap-4 py-4",
        lg:   "gap-6 py-6",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
    },
  }
)

function Card({
  className,
  variant,
  padding,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ variant, padding }), className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("px-6 border-b border-white/8 pb-4", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-semibold text-base leading-snug", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 pt-0", className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants }
