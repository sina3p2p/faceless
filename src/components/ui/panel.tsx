import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const panelVariants = cva(
  "overflow-hidden",
  {
    variants: {
      elevation: {
        low:  "glass-subtle",
        mid:  "glass-base",
        high: "glass-elevated",
      },
      radius: {
        md: "rounded-xl",
        lg: "rounded-2xl",
        xl: "rounded-3xl",
      },
    },
    defaultVariants: {
      elevation: "mid",
      radius: "lg",
    },
  }
)

function Panel({
  className,
  elevation,
  radius,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof panelVariants>) {
  return (
    <div
      data-slot="panel"
      className={cn(panelVariants({ elevation, radius }), className)}
      {...props}
    />
  )
}

export { Panel, panelVariants }
