"use client";

const ROW_1 = [
  { name: "Alex M.", handle: "@alexcreates", text: "Went from 0 to 50K followers in 3 months posting AI scary stories. This tool is genuinely insane." },
  { name: "Sarah K.", handle: "@sarahk_content", text: "I run 4 niche accounts now. Each gets consistent views and I barely spend any time on it." },
  { name: "David R.", handle: "@davidreelz", text: "My engagement rate doubled after switching to the bold pop caption style. Nothing else changed." },
  { name: "Priya T.", handle: "@priyatv", text: "Zero editing skills and I'm getting 100K+ views. The AI picks better visuals than I ever could." },
  { name: "Marcus L.", handle: "@marcuslive", text: "I generate 10 videos a week across 3 channels. What used to take days now takes 20 minutes." },
  { name: "Jen W.", handle: "@jenwrites", text: "The script quality is insane. Hooks that actually work. Better than anything I write myself." },
];

const ROW_2 = [
  { name: "Tom H.", handle: "@tomharris_yt", text: "Built a mythology channel to 80K in 6 months. Every single video made with Faceless." },
  { name: "Aisha N.", handle: "@aishanoir", text: "TikTok keeps pushing my content. The captions are exactly what the algorithm loves right now." },
  { name: "Chris P.", handle: "@chrisp_vids", text: "I was skeptical about AI video tools. Two months later, my true crime channel is monetized." },
  { name: "Riley G.", handle: "@rileygcontent", text: "Switched from manually editing to Faceless. Never going back. The time savings are incredible." },
  { name: "Sofia V.", handle: "@sofiavcreator", text: "I tested 6 different AI video tools. Faceless isn't close — it's in a different category." },
  { name: "Jake R.", handle: "@jakereel", text: "Scary stories niche is printing. Under 5 minutes per video and the quality is embarrassingly good." },
];

interface TestimonialCardProps {
  name: string;
  handle: string;
  text: string;
}

function TestimonialCard({ name, handle, text }: TestimonialCardProps) {
  return (
    <div
      className="shrink-0 w-72 rounded-2xl px-5 py-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Stars */}
      <div className="flex gap-0.5 mb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <svg key={i} className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        ))}
      </div>
      <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(250,250,250,0.78)" }}>
        &ldquo;{text}&rdquo;
      </p>
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8" }}
        >
          {name[0]}
        </div>
        <div>
          <p className="text-xs font-semibold text-white leading-none">{name}</p>
          <p className="text-[0.6875rem] mt-0.5" style={{ color: "var(--muted-foreground)" }}>{handle}</p>
        </div>
      </div>
    </div>
  );
}

export function TestimonialTicker() {
  return (
    <div className="pause-on-hover overflow-hidden space-y-3 py-1" style={{ maskImage: "linear-gradient(90deg, transparent 0%, black 6%, black 94%, transparent 100%)" }}>
      {/* Row 1 — left */}
      <div className="flex gap-3 animate-ticker">
        {[...ROW_1, ...ROW_1].map((t, i) => (
          <TestimonialCard key={i} {...t} />
        ))}
      </div>
      {/* Row 2 — right */}
      <div className="flex gap-3 animate-ticker-reverse">
        {[...ROW_2, ...ROW_2].map((t, i) => (
          <TestimonialCard key={i} {...t} />
        ))}
      </div>
    </div>
  );
}
