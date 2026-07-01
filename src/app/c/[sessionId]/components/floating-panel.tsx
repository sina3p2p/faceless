"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { Card } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

interface FloatingPanelProps {
  containerRef: RefObject<HTMLDivElement | null>
  initialPos?: { x: number; y: number }
  title: string
  icon?: React.ReactNode
  width?: number
  zIndex?: number
  onClose: () => void
  children: React.ReactNode
}

function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
  )
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return mobile
}

export function FloatingPanel({
  containerRef,
  initialPos = { x: 16, y: 16 },
  title,
  icon,
  width = 300,
  zIndex = 30,
  onClose,
  children,
}: FloatingPanelProps) {
  const selfRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(initialPos)
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragState.current) return
      const { startX, startY, originX, originY } = dragState.current
      const container = containerRef.current
      const popup = selfRef.current
      const popupH = popup?.offsetHeight ?? 200
      const popupW = popup?.offsetWidth ?? width
      const maxX = container ? container.clientWidth - popupW : Infinity
      const maxY = container ? container.clientHeight - popupH : Infinity
      setPos({
        x: Math.max(0, Math.min(maxX, originX + (e.clientX - startX))),
        y: Math.max(0, Math.min(maxY, originY + (e.clientY - startY))),
      })
    }
    function onUp() { dragState.current = null }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [containerRef, width])

  function onHeaderPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragState.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y }
  }

  const header = (
    <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/8 select-none">
      <div className="flex items-center gap-2 text-white/70">
        {icon}
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <button
        onClick={onClose}
        className="w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )

  if (isMobile) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" showCloseButton={false} className="glass-elevated border-white/14 rounded-t-2xl p-0">
          <SheetHeader className="p-0">
            <SheetTitle className="sr-only">{title}</SheetTitle>
            {header}
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Card
      ref={selfRef}
      variant="panel-dark"
      padding="none"
      className="absolute"
      style={{ left: pos.x, top: pos.y, width, zIndex }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="cursor-grab active:cursor-grabbing" onPointerDown={onHeaderPointerDown}>
        {header}
      </div>
      {children}
    </Card>
  )
}
