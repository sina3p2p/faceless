"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { QuestionItem } from "@/types/v2/story"

export function formatQuestionsAnswers(questions: QuestionItem[], answers: string[]) {
  return questions
    .map((q, i) => `Q: ${q.question}\nA: ${answers[i] ?? "—"}`)
    .join("\n\n")
}

export function QuestionsPicker({
  questions,
  onSubmit,
  disabled,
}: {
  questions: QuestionItem[]
  onSubmit: (answers: string[]) => void
  disabled?: boolean
}) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""))
  const [customMode, setCustomMode] = useState(false)
  const [customText, setCustomText] = useState("")

  const current = questions[index]
  const total = questions.length
  if (!current) return null

  function commitAnswer(value: string) {
    if (disabled || !value.trim()) return
    const next = [...answers]
    next[index] = value.trim()
    setAnswers(next)
    setCustomMode(false)
    setCustomText("")

    if (index >= total - 1) {
      onSubmit(next)
    } else {
      setIndex(index + 1)
    }
  }

  function goBack() {
    if (index <= 0 || disabled) return
    setCustomMode(false)
    setCustomText("")
    setIndex(index - 1)
  }

  function goForward() {
    if (index >= total - 1 || disabled || !answers[index]) return
    setCustomMode(false)
    setCustomText("")
    setIndex(index + 1)
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#141414] p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-3 px-0.5">
        <p className="text-[15px] font-medium text-white leading-snug min-w-0">
          {current.question}
        </p>
        {total > 1 && (
          <div className="flex items-center gap-1 shrink-0 text-muted-foreground/70 pt-0.5">
            <button
              type="button"
              onClick={goBack}
              disabled={index === 0 || disabled}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/5 disabled:opacity-30"
              aria-label="Previous question"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-xs tabular-nums min-w-9 text-center">
              {index + 1}/{total}
            </span>
            <button
              type="button"
              onClick={goForward}
              disabled={index >= total - 1 || !answers[index] || disabled}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/5 disabled:opacity-30"
              aria-label="Next question"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {current.options.map((option, i) => {
          const isRecommended = current.recommendedIndex === i
          const isSelected = answers[index] === option

          return (
            <button
              key={`${index}-${i}`}
              type="button"
              onClick={() => commitAnswer(option)}
              disabled={disabled}
              className={cn(
                "w-full text-left rounded-xl px-3 py-3 flex items-center gap-3 transition-colors cursor-pointer",
                isSelected
                  ? "bg-white/12"
                  : isRecommended
                    ? "bg-white/8 hover:bg-white/12"
                    : "bg-white/5 hover:bg-white/10",
                disabled && "opacity-50 cursor-default"
              )}
            >
              <span
                className={cn(
                  "shrink-0 w-6 h-6 mt-0.5 rounded-md flex items-center justify-center text-xs font-medium border",
                  isSelected
                    ? "border-white/25 bg-white/15 text-white"
                    : "border-white/10 bg-black/20 text-muted-foreground"
                )}
              >
                {i + 1}
              </span>
              <span className="flex-1 min-w-0 text-[14px] text-foreground/90 leading-snug whitespace-normal">
                {option}
                {isRecommended && (
                  <span className="text-muted-foreground"> (Recommended)</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="pt-0.5">
        {!customMode ? (
          <button
            type="button"
            onClick={() => setCustomMode(true)}
            disabled={disabled}
            className="text-xs text-muted-foreground/55 hover:text-muted-foreground transition-colors px-1"
          >
            + Write my own
          </button>
        ) : (
          <div className="space-y-2 rounded-xl bg-white/5 border border-white/8 p-3">
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Your answer…"
              rows={2}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 resize-none outline-none"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => commitAnswer(customText)}
                disabled={!customText.trim() || disabled}
              >
                Use this
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCustomMode(false)
                  setCustomText("")
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
