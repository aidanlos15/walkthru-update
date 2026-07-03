# Walkthru

Paste room photos **or** an Airbnb link → get a cinematic AI video tour of the property.

Ingest (photos or scraped link) → **Director** (Claude, vision) → **Render** (Higgsfield DoP) → **Stitch** (Creatomate) → mp4.

## Stack

- Next.js (App Router, TypeScript) + Tailwind CSS
- No DB / queue / cloud storage: job state lives in an in-memory `Map` keyed by `jobId`
- The long pipeline runs inside one server route (localhost has no serverless timeout)
- Provider status is **polled**, never webhooked (webhooks can't reach localhost)

## Setup

```bash
npm install
cp .env.example .env   # then fill in keys (or leave MOCK_MODE=true)
npm run dev            # http://localhost:3000
```

## MOCK_MODE

`MOCK_MODE=true` (the default) skips the scraper and every provider render call
and serves local fixtures from `/fixtures`, so you can build and click through
the whole UI without burning API credits.

- **On** → fake progress, fixture images/director plan, a hosted sample video.
- **Off** → real Apify / Claude / Higgsfield / Creatomate calls (Phases 2–4).

Toggle it in `.env`:

```
MOCK_MODE=true   # or false for live providers
```

Restart `npm run dev` after changing env vars.

## Environment variables

All secrets are read from env only (`src/lib/env.ts`) and fail loudly if missing
in live mode. Never commit `.env`.

| Var | Used by | Needed when |
| --- | --- | --- |
| `MOCK_MODE` | everything | always |
| `ANTHROPIC_API_KEY` | Director (claude-sonnet-5) | live mode |
| `HIGGSFIELD_API_KEY` / `HIGGSFIELD_API_SECRET` | Render (dop-turbo) | live mode |
| `APIFY_TOKEN` | Airbnb scraper | live link mode |
| `CREATOMATE_API_KEY` | Stitch (raw token, no `Bearer`) | live mode |
| `RENDER_HERO_WITH_VEO` / `FAL_KEY` | stretch: Veo hero shot | optional |

## Build order / status

- **Phase 1 ✅**: scaffold, design system, landing + both flows, processing
  stepper on a real job store, result player. Fully working in MOCK_MODE.
- **Phase 2 ✅**: photo ingest + Claude director (vision, `claude-sonnet-5`) → `src/lib/steps/director.ts`
- **Phase 3 ✅**: Higgsfield render (dop-turbo) + Creatomate stitch → `render.ts`, `stitch.ts`
- **Phase 4 ✅**: Apify link ingest → `src/lib/steps/scrape.ts`
- **Phase 5** - polish: error states, mobile, share/download

`MOCK_MODE=false` runs the full live pipeline. Uploaded photos are base64 data
URLs, so the render step uploads them to the Higgsfield CDN first; scraped
Airbnb URLs are already public and pass straight through.

Each provider step is already stubbed with its real signature, so later phases
drop in without refactoring the orchestrator (`src/lib/pipeline.ts`).

## Constraints honored

- Max 100 images per tour (enforced at ingest, client + server; the Claude API
  caps a single request at 100 images, and classify/director send all photos in
  one request. Override with the `MAX_IMAGES` env var, up to that ceiling.)
- Secrets from env only; `.env` gitignored; `.env.example` provided
- Provider steps are idempotent per job; failures set `status: "error"` with a
  message the UI renders
```
