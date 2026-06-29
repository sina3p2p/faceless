"use client"

import * as React from "react"
import { useState, useEffect, useRef } from "react"
import { Mic, ArrowUp } from "lucide-react"
import { AnimatePresence, motion, type Variants } from "framer-motion"

const PLACEHOLDERS = [
  "Aliens helped build the pyramids — one archaeologist can prove it",
  "A jazz musician finds a coded message in her father's last symphony",
  "The last AI on Earth falls for a lighthouse keeper off the grid",
  "Two brothers inherit a failing circus and one summer to save it",
  "A linguist realizes the killer she's profiling is her future self",
]

interface AIChatInputProps {
  onSubmit: (value: string) => void
  loading?: boolean
  error?: string | null
}

const AIChatInput = ({ onSubmit, loading, error }: AIChatInputProps) => {
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [showPlaceholder, setShowPlaceholder] = useState(true)
  const [isActive, setIsActive] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const wrapperRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autoResize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    if (isActive || inputValue) return
    const interval = setInterval(() => {
      setShowPlaceholder(false)
      setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length)
        setShowPlaceholder(true)
      }, 400)
    }, 4500)
    return () => clearInterval(interval)
  }, [isActive, inputValue])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        if (!inputValue) setIsActive(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [inputValue])

  const handleSubmit = () => {
    const trimmed = inputValue.trim()
    if (!trimmed || loading) return
    onSubmit(trimmed)
  }

  const placeholderContainerVariants = {
    initial: {},
    animate: { transition: { staggerChildren: 0.015 } },
    exit: { transition: { staggerChildren: 0.008, staggerDirection: -1 } },
  }

  const letterVariants: Variants = {
    initial: { opacity: 0, filter: "blur(12px)", y: 10 },
    animate: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: {
        opacity: { duration: 0.25 },
        filter: { duration: 0.4 },
        y: { type: "spring", stiffness: 80, damping: 20 },
      },
    },
    exit: {
      opacity: 0,
      filter: "blur(8px)",
      y: -8,
      transition: { duration: 0.15 },
    },
  }

  return (
    <div
      ref={wrapperRef}
      className="w-full"
      style={{
        borderRadius: 24,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: isActive ? "0 8px 32px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.2)",
        transition: "box-shadow 0.2s",
      }}
      onClick={() => setIsActive(true)}
    >
      <div className="flex flex-col items-stretch w-full">
        {/* Textarea + buttons overlay */}
        <div className="relative w-full">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              autoResize()
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            className="w-full border-0 outline-none bg-transparent text-sm text-foreground resize-none overflow-hidden leading-relaxed block"
            style={{ padding: "14px 108px 14px 16px" }}
            onFocus={() => setIsActive(true)}
          />

          {/* Animated placeholder */}
          <div
            className="absolute top-0 left-0 h-full pointer-events-none flex items-center"
            style={{ left: 16, right: 108 }}
          >
            <AnimatePresence mode="wait">
              {showPlaceholder && !isActive && !inputValue && (
                <motion.span
                  key={placeholderIndex}
                  className="text-sm text-muted-foreground/50 select-none leading-relaxed"
                  style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                  variants={placeholderContainerVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {PLACEHOLDERS[placeholderIndex].split("").map((char, i) => (
                    <motion.span key={i} variants={letterVariants} style={{ display: "inline-block" }}>
                      {char === " " ? " " : char}
                    </motion.span>
                  ))}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Buttons — pinned to bottom-right */}
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <button
              className="p-2.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
              title="Voice input"
              type="button"
              tabIndex={-1}
            >
              <Mic size={18} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleSubmit() }}
              disabled={!inputValue.trim() || loading}
              className="flex items-center justify-center p-2.5 rounded-full transition disabled:opacity-30"
              style={{ background: "white", color: "#000" }}
              title="Start the story room"
              type="button"
            >
              {loading ? (
                <svg className="w-[18px] h-[18px] animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <ArrowUp size={18} />
              )}
            </button>
          </div>
        </div>

        {/* Footer: hint / error */}
        <AnimatePresence>
          {(isActive || inputValue) && (
            <motion.div
              className="w-full flex justify-between px-4 pb-3 text-xs text-muted-foreground/60"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              {error ? (
                <span className="text-destructive">{error}</span>
              ) : (
                <span>Enter to submit · Shift+Enter for new line</span>
              )}
              <span>{inputValue.length}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export { AIChatInput }
