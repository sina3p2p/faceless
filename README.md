# Faceless Video SaaS

AI-powered faceless short-form video generator. Create viral TikTok, Reels, and YouTube Shorts content on autopilot.

## Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Queue**: BullMQ + Redis
- **AI**: OpenRouter (LLM), ElevenLabs (TTS), OpenAI (image gen)
- **Video**: FFmpeg composition pipeline
- **Billing**: Stripe
- **Deployment**: Railway

## Getting Started

```bash
# Install dependencies
npm install

# Copy env file and fill in values
cp .env.example .env

# Push schema to database
npm run db:push

# Run development server
npm run dev

# Run worker (separate terminal)
npm run dev:worker
```

## Project Structure

```
src/
├── app/              # Next.js App Router (pages + API routes)
│   ├── api/          # API endpoints
│   ├── auth/         # Auth pages
│   └── dashboard/    # Main app dashboard
├── components/       # React components
│   └── ui/           # Reusable UI primitives
├── lib/              # Shared utilities (auth, queue, storage, etc.)
├── server/           # Server-side code
│   ├── db/           # Drizzle client + schema
│   └── services/     # LLM, TTS, media, composer services
├── types/            # TypeScript type declarations
└── worker/           # Background job workers
```

## Railway Deployment

This repo deploys as two Railway services from the same codebase:

- **web**: `Dockerfile` (Next.js app, auto-runs `drizzle-kit push` on start)
- **worker**: `Dockerfile.worker` (FFmpeg + queue consumer)

Both services share the same Postgres and Redis instances.
