import Link from "next/link";
import { Button } from "@/components/ui/button";

const NICHES = [
  "Mythology",
  "Scary Stories",
  "History",
  "Anime Stories",
  "Motivation",
  "True Crime",
  "Science Facts",
  "Life Hacks",
];

const STEPS = [
  {
    number: "01",
    title: "Create a Series",
    description:
      "Choose your niche and customize video style, voice, and captions. Optionally add topic ideas or let AI choose.",
    features: ["Unlimited niches supported", "Multiple art styles & voices"],
  },
  {
    number: "02",
    title: "Generate Videos",
    description:
      "Our AI writes the script, generates voiceover, finds visuals, adds styled captions, and renders your video.",
    features: ["Full autopilot generation", "Under 5 minutes per video"],
  },
  {
    number: "03",
    title: "Download & Publish",
    description:
      "Preview your video, download in HD, and publish to TikTok, Instagram Reels, or YouTube Shorts.",
    features: ["1080x1920 HD output", "Ready for all platforms"],
  },
];

const TESTIMONIALS = [
  {
    name: "Alex M.",
    text: "Went from 0 to 50K followers in 3 months just posting AI-generated scary stories. This tool is insane.",
  },
  {
    name: "Sarah K.",
    text: "I run 4 different niche accounts now. Each one gets consistent views and I barely spend any time on it.",
  },
  {
    name: "David R.",
    text: "The caption styles are what really set this apart. My engagement rate doubled after switching to the bold pop style.",
  },
  {
    name: "Priya T.",
    text: "As someone with zero video editing skills, this is a game changer. The AI picks better visuals than I ever could.",
  },
];

const PRICING = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "3 videos per month",
      "All niches & styles",
      "HD 1080x1920 output",
      "Styled captions",
      "Manual download",
    ],
    cta: "Get Started Free",
    highlighted: false,
  },
  {
    name: "Starter",
    price: "$19",
    period: "per month",
    features: [
      "30 videos per month",
      "All niches & styles",
      "HD 1080x1920 output",
      "All caption styles",
      "Priority rendering",
      "Email support",
    ],
    cta: "Start Creating",
    highlighted: true,
  },
  {
    name: "Pro",
    price: "$49",
    period: "per month",
    features: [
      "100 videos per month",
      "All niches & styles",
      "HD 1080x1920 output",
      "All caption styles",
      "Priority rendering",
      "Custom voice uploads",
      "Priority support",
    ],
    cta: "Go Pro",
    highlighted: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-grid">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-black/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">
            Faceless
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm text-gray-400 hover:text-white transition-colors">
              How it works
            </a>
            <a href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">
              Pricing
            </a>
            <a href="#testimonials" className="text-sm text-gray-400 hover:text-white transition-colors">
              Testimonials
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/signin">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link href="/auth/signin">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-fuchsia-600/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-sm text-gray-400 mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Trusted by 10,000+ creators
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            Create viral faceless
            <br />
            <span className="text-gradient">videos on autopilot</span>
          </h1>

          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            The AI that writes scripts, generates voiceover, finds visuals, adds
            captions, and renders publish-ready videos — all in under 5 minutes.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link href="/auth/signin">
              <Button size="lg" className="min-w-[200px]">
                Start Creating Free
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="outline" size="lg" className="min-w-[200px]">
                See How It Works
              </Button>
            </a>
          </div>

          {/* Niche pills */}
          <div className="flex flex-wrap justify-center gap-2">
            {NICHES.map((niche) => (
              <span
                key={niche}
                className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-gray-400"
              >
                {niche}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              How It Works
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Create faceless videos in three simple steps. No editing skills required.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((step) => (
              <div
                key={step.number}
                className="relative rounded-2xl border border-white/10 bg-white/[0.02] p-8 hover:bg-white/[0.04] transition-colors"
              >
                <span className="text-5xl font-bold text-violet-500/20 mb-4 block">
                  {step.number}
                </span>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-gray-400 mb-6">{step.description}</p>
                <ul className="space-y-2">
                  {step.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                      <svg
                        className="w-4 h-4 text-violet-400 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-6 bg-white/[0.01]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Loved by Creators
            </h2>
            <p className="text-gray-400 text-lg">
              See what our users have to say.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-8"
              >
                <p className="text-gray-300 mb-4 leading-relaxed">
                  &ldquo;{t.text}&rdquo;
                </p>
                <p className="text-sm font-medium text-violet-400">{t.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Simple Pricing
            </h2>
            <p className="text-gray-400 text-lg">
              Start free. Upgrade when you need more videos.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {PRICING.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border p-8 ${
                  plan.highlighted
                    ? "border-violet-500/50 bg-violet-500/5 glow"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <h3 className="text-lg font-semibold mb-2">{plan.name}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-gray-400 ml-1">/{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                      <svg
                        className="w-4 h-4 text-violet-400 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/auth/signin" className="block">
                  <Button
                    variant={plan.highlighted ? "primary" : "outline"}
                    className="w-full"
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Ready to go viral?
          </h2>
          <p className="text-gray-400 text-lg mb-10">
            Create your first faceless video in under 5 minutes. No credit card
            required.
          </p>
          <Link href="/auth/signin">
            <Button size="lg" className="min-w-[250px]">
              Create Your First Video
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Faceless. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              Terms
            </a>
            <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              Privacy
            </a>
            <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
