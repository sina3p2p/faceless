"use client"

import { useState, useId } from "react"
import { cn } from "@/lib/utils"

// 64×64 displacement map:
// R = X displacement, B = Y displacement, 128 = neutral
// Values push outward from center at edges only (outer 35% ring)
function makeDisplacementMap(): string {
  const N = 64
  const canvas = document.createElement("canvas")
  canvas.width = N
  canvas.height = N
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(N, N)

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const nx = (x / (N - 1)) * 2 - 1 // −1..1
      const ny = (y / (N - 1)) * 2 - 1

      const edgeness = Math.max(Math.abs(nx), Math.abs(ny))
      const t = Math.max(0, (edgeness - 0.65) / 0.35)
      const s = t * t * (3 - 2 * t) // smoothstep

      const len = Math.sqrt(nx * nx + ny * ny) || 1
      const dx = (nx / len) * s
      const dy = (ny / len) * s

      const i = (y * N + x) * 4
      img.data[i] = Math.round(128 + dx * 110)
      img.data[i + 1] = 128
      img.data[i + 2] = Math.round(128 + dy * 110)
      img.data[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL()
}

let _map: string | null = null
function getMap(): string {
  if (!_map) _map = makeDisplacementMap()
  return _map
}

export interface GlassPanelProps extends React.ComponentProps<"div"> {
  /** Backdrop blur radius in px. Default 24. */
  blur?: number
  /** SVG displacement warp amount. Default 30. Increase for more lens distortion. */
  displacement?: number
  /** Chromatic aberration (RGB channel separation). Default 2. */
  aberration?: number
  /** Background tint. "light" | "dark" or any CSS color string. Default "light". */
  tint?: "light" | "dark" | string
  /** className forwarded to the inner content wrapper div. */
  childrenClassName?: string
  /** Allow children to overflow (e.g. flyout menus). Glass layers are still clipped via border-radius. */
  noClip?: boolean
  /** Border radius in px. Default 24. */
  borderRadius?: number
  /** Border width in px. Default 1. */
  borderWidth?: number
  /** Border color. Default white/10. */
  borderColor?: string
}

/**
 * Liquid glass panel using SVG feDisplacementMap + backdrop-filter.
 * The displacement filter warps the blurred backdrop to simulate glass refraction.
 * Full effect (chromatic aberration) is Chrome-only; other browsers get frosted glass.
 *
 * Apply border/radius via className: "rounded-2xl border border-white/20"
 */
export function GlassPanel({
  blur = 24,
  displacement = 30,
  aberration = 2,
  borderRadius = 24,
  borderWidth = 1,
  borderColor = "#ffffff1a",
  tint = "light",
  noClip = false,
  className,
  childrenClassName,
  style,
  children,
  ...props
}: GlassPanelProps) {
  const uid = useId().replace(/:/g, "")
  const filterId = `gpf-${uid}`

  const [mapUrl] = useState<string>(() =>
    typeof window !== "undefined" ? getMap() : ""
  )

  const tintColor = tint === "light" ? "rgba(255,255,255,0.09)" : tint === "dark" ? "rgba(0,0,0,0.25)" : tint

  const scaleR = displacement * (1 + aberration * 0.03)
  const scaleG = displacement
  const scaleB = displacement * (1 - aberration * 0.03)

  return (
    <div className={cn("relative", !noClip && "overflow-hidden", className)} style={{ ...style, borderRadius: `${borderRadius}px`, borderWidth: `${borderWidth}px`, borderColor }} {...props}>

      {/* Warp layer: backdrop-filter blur + SVG displacement applied on top */}
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{
          backdropFilter: `blur(${blur}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${blur}px) saturate(180%)`,
          borderRadius: `${borderRadius}px`,
          ...(mapUrl && {
            filter: `url(#${filterId})`,
            WebkitFilter: `url(#${filterId})`,
          }),
        }}
      />

      {/* White tint overlay */}
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ background: tintColor, borderRadius: `${borderRadius}px` }}
      />

      {/* Top-edge specular highlight — the defining liquid glass property */}
      {/* <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)",
        }}
      /> */}

      {/* SVG filter definition (invisible, Chrome reads it by ID) */}
      {mapUrl && (
        <svg aria-hidden style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
          <defs>
            <filter id={filterId} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
              {/* Displacement map source */}
              <feImage href={mapUrl} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />

              {/* Three displacement passes — slightly different scale per RGB channel = chromatic aberration */}
              <feDisplacementMap in="SourceGraphic" in2="map" scale={scaleR} xChannelSelector="R" yChannelSelector="B" result="dR" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale={scaleG} xChannelSelector="R" yChannelSelector="B" result="dG" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale={scaleB} xChannelSelector="R" yChannelSelector="B" result="dB" />

              {/* Isolate each RGB channel */}
              <feColorMatrix type="matrix" in="dR" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rOnly" />
              <feColorMatrix type="matrix" in="dG" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gOnly" />
              <feColorMatrix type="matrix" in="dB" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bOnly" />

              {/* Recombine via screen blend */}
              <feBlend in="rOnly" in2="gOnly" mode="screen" result="rg" />
              <feBlend in="rg" in2="bOnly" mode="screen" />
            </filter>
          </defs>
        </svg>
      )}

      {/* Content sits above the glass layers */}
      <div className={cn("relative", childrenClassName)}>{children}</div>
    </div>
  )
}
