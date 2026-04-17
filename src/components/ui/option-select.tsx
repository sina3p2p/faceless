"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export type OptionSelectItem = {
  value: string;
  label: string;
  description?: string;
  badge?: string;
};

type OptionSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly OptionSelectItem[] | OptionSelectItem[];
  /** Accessible name override for the trigger (defaults to label). */
  triggerAriaLabel?: string;
};

export function OptionSelect({
  label,
  value,
  onChange,
  options,
  triggerAriaLabel,
}: OptionSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);
  const selected = options[selectedIndex] ?? options[0];

  const beginOpen = useCallback(() => {
    setHighlightedIndex(selectedIndex);
    setOpen(true);
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      listRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${highlightedIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, open]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const selectIndex = useCallback(
    (index: number) => {
      const opt = options[index];
      if (!opt) return;
      onChange(opt.value);
      close();
    },
    [close, onChange, options]
  );

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        beginOpen();
        return;
      }
      if (e.key === "ArrowDown") {
        setHighlightedIndex((i) => Math.min(options.length - 1, i + 1));
      } else {
        setHighlightedIndex((i) => Math.max(0, i - 1));
      }
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) {
        setOpen(false);
      } else {
        beginOpen();
      }
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setHighlightedIndex(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setHighlightedIndex(options.length - 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      selectIndex(highlightedIndex);
    }
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <span id={`${listId}-label`} className="block text-sm font-medium text-gray-300 mb-2">
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        id={`${listId}-trigger`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${listId}-label`}
        {...(triggerAriaLabel ? { "aria-label": triggerAriaLabel } : {})}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            beginOpen();
          }
        }}
        onKeyDown={onTriggerKeyDown}
        className={`group flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
          open
            ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500"
            : "border-white/10 bg-white/5 hover:border-white/20"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-white text-sm truncate">
            {selected?.label}
          </span>
          {selected?.description && (
            <span className="mt-0.5 block text-xs text-gray-400 line-clamp-2">
              {selected.description}
            </span>
          )}
        </span>
        <span
          className={`shrink-0 text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180 text-violet-300" : "group-hover:text-gray-300"
          }`}
          aria-hidden
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${listId}-label`}
          onKeyDown={onListKeyDown}
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-gray-950/95 py-1.5 shadow-xl shadow-black/40 ring-1 ring-white/5 backdrop-blur-md outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
        >
          {options.map((opt, index) => {
            const isSelected = opt.value === value;
            const isHi = index === highlightedIndex;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-option-index={index}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectIndex(index)}
                className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                  isHi
                    ? "bg-violet-500/15"
                    : isSelected
                      ? "bg-white/[0.04]"
                      : "hover:bg-white/[0.06]"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-white text-sm">{opt.label}</span>
                    {opt.badge && (
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-500/25 text-violet-200">
                        {opt.badge}
                      </span>
                    )}
                  </span>
                  {opt.description && (
                    <span className="mt-0.5 block text-xs text-gray-400 leading-snug">
                      {opt.description}
                    </span>
                  )}
                </span>
                {isSelected && (
                  <span className="mt-0.5 shrink-0 text-violet-400" aria-hidden>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
