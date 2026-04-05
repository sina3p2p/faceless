# Faceless Video SaaS — MVP Product Requirements Document

## Overview

A SaaS platform that generates faceless short-form videos (TikTok, Reels, Shorts) on autopilot. Users create a "series" by choosing a niche, the AI generates scripts, voiceover, visuals, and captions, then renders a publish-ready 9:16 video.

## Target Users

- Solo content creators who want faceless channels without editing skills.
- Side-hustlers exploring short-form monetization.
- Small agencies managing multiple niche accounts.

## Core User Flow

1. Sign up / log in (NextAuth).
2. Create a Series: pick niche, art style, voice, caption style, optional topic ideas.
3. Generate Video: AI writes script, fetches media, generates voiceover, composes video.
4. Preview & Export: watch preview, download MP4.

## In-Scope (MVP)

| Feature | Details |
|---|---|
| Auth | NextAuth with credentials + Google/GitHub OAuth |
| Series CRUD | Create, edit, delete series with niche, style defaults, topic seeds |
| Video generation pipeline | Script (OpenRouter) → TTS (ElevenLabs) → Media (Pexels + DALL-E fallback) → FFmpeg render |
| Styled captions | Word-level timing, animated highlights, customizable fonts/colors |
| Real-time progress | SSE or polling for job status during generation |
| Preview + download | In-browser video player, MP4 download via signed URL |
| Billing | Stripe checkout, webhook handling, plan-based monthly credits |
| Usage limits | Hard + soft caps, graceful limit-reached UX |
| Landing page | Hero, how-it-works, pricing, CTA, testimonials placeholder |
| Admin view | Basic user/job troubleshooting dashboard |
| Railway deployment | Web + worker services, managed Postgres/Redis, S3 storage |

## Out-of-Scope (MVP)

- Multi-platform auto-posting (TikTok, IG, YouTube).
- Scheduling / queue-ahead publishing.
- Analytics dashboard (views, engagement).
- Workspaces / team collaboration / multi-seat orgs.
- Custom video templates / template marketplace.
- Mobile app.
- Generative AI video models (Runway, Kling) as primary source.
- Affiliate / referral system.

## Acceptance Criteria

1. A new user can sign up, create a series, and download a generated video in under 10 minutes.
2. Generated videos are 9:16, 30-60 seconds, with voiceover, styled captions, transitions, and background music.
3. Video generation completes in under 5 minutes (median).
4. Generation success rate is above 85%.
5. Failed jobs are retried automatically (up to 3 attempts) without duplicate billing.
6. Users on a free/trial plan are limited to N videos/month; paid plans unlock higher limits.
7. Stripe billing correctly provisions and enforces plan-based credits.
8. The app deploys and runs on Railway with web + worker services.
9. Landing page loads in under 3 seconds and is mobile-responsive.

## Technical Constraints

- Single Next.js repo (no monorepo).
- Worker process runs in the same repo with a separate Dockerfile (includes FFmpeg).
- All rendered assets stored in S3-compatible storage, not container disk.
- Provider interfaces abstract LLM, TTS, media, and image-gen for easy swaps.
- OpenRouter used for all LLM calls with automatic fallback.

## Success Metrics

- Time-to-first-video: < 10 minutes.
- Video generation completion rate: > 85%.
- Week-1 retention: > 25% for activated users.
- Paid conversion from trial: 3-8%.
