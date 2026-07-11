"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AssistantText({
  text,
  isTyping,
}: {
  text: string;
  reasoning?: string;
  isTyping: boolean;
}) {
  return (
    <div className="text-[14px] leading-[1.75] text-foreground">
      {text ? (
        // Plain text while streaming — incomplete markdown blanks ReactMarkdown.
        isTyping ? (
          <p className="whitespace-pre-wrap">
            {text}
            <span className="inline-block w-0.5 h-[1em] bg-primary ml-0.5 align-text-bottom animate-pulse" />
          </p>
        ) : (
          <div
            className="prose prose-invert max-w-none min-w-0 wrap-break-word
            prose-p:my-1.5 prose-p:leading-[1.75] prose-p:text-foreground
            prose-headings:text-white prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-1.5
            prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
            prose-strong:text-white
            prose-ul:my-1.5 prose-ul:pl-5 prose-ol:my-1.5 prose-ol:pl-5 prose-li:my-0.5 prose-li:text-foreground
            prose-code:text-foreground prose-code:bg-transparent prose-code:px-0 prose-code:py-0 prose-code:rounded-none prose-code:text-[14px] prose-code:font-sans prose-code:before:content-none prose-code:after:content-none
          "
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )
      ) : (
        <span className="inline-flex gap-0.5 align-middle">
          {[0, 150, 300].map((d) => (
            <span
              key={d}
              className="w-1 h-1 rounded-full bg-primary animate-bounce"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </span>
      )}
    </div>
  );
}
