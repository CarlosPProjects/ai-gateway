# AGENTS.md — AI Gateway

## Project Overview
Intelligent LLM Router with semantic caching, deployed on GKE Autopilot.
- **Stack:** TypeScript, Bun, Hono, Vercel AI SDK, Redis Stack
- **Repo:** CarlosPProjects/ai-gateway
- **Package Manager:** Bun (NOT npm/pnpm)

## Architecture
Middleware Chain pattern (inspired by Portkey/LiteLLM):
```
Request → Tracing → Logging → Rate Limit → Timeout → Smart Router → Semantic Cache → LLM Call
                                                                                        ↓
Response ← Cost Tracking ← Cache Store ← Stream/Response ← Provider Adapter ← LLM Response
```

## Conventions

### Code Style
- **Language:** TypeScript (strict mode)
- **Runtime:** Bun
- **Framework:** Hono
- **LLM Abstraction:** Vercel AI SDK (`ai` package)
- **Formatting:** Use Biome for lint + format
- **Imports:** Use path aliases (`@/` → `src/`)

### File Structure
```
src/
├── index.ts              # Entry point (Hono app, middleware chain, graceful shutdown)
├── config/               # Env vars, pricing, cache, routing config, route aliases
├── middleware/            # Hono middleware (tracing, logging, rate-limit, timeout, smart-router, cache, error-handler)
├── metrics/              # Latency tracker + EMA/percentile aggregator
├── routes/               # Route handlers (chat completions, health/ready/metrics)
├── routing/              # Smart routing engine (rules, fallback, retry, model selector, provider registry)
├── services/
│   ├── cache/            # Semantic caching (Redis + embeddings + vector index)
│   ├── providers/        # LLM provider adapters (Model Factory pattern)
│   ├── router/           # Static route resolution
│   ├── cost-tracker.ts   # Per-request cost calculation + alerts
│   ├── error-tracker.ts  # Per-provider error tracking
│   └── metrics.ts        # In-memory metrics store
├── telemetry/            # OpenTelemetry setup
├── types/                # Shared TypeScript types (Zod schemas, routing, metrics, etc.)
└── utils/                # Token bucket rate limiter
```

### Patterns
- **Model Factory:** Dynamic provider registry using Vercel AI SDK. See `docs/research/architecture.md`.
- **Provider Adapters:** All I/O normalized to OpenAI format. Vercel AI SDK handles the translation.
- **Middleware Chain:** Hono middlewares: tracing → logging → rate-limit → timeout → smart-router → semantic-cache.
- **Error Handling:** Normalize all provider errors to OpenAI-compatible JSON format via global error handler.
- **Config-driven capabilities:** Model capabilities are defined in `rules-engine.ts` and can be extended at runtime.

### Verification
- **Type check:** `bun run typecheck` (runs `bunx tsc --noEmit`)
- **Lint + format:** `bun run lint` / `bun run check`
- Tests were intentionally removed — verify correctness via type checking and manual testing.
- Mock external APIs (never call real LLM APIs in automated checks).

### Environment Variables
- Copy `.env.example` → `.env`
- Never commit `.env` or real API keys
- Use `process.env.VARIABLE_NAME` (Bun loads .env automatically)
- All env vars are Zod-validated at startup in `config/env.ts`

### Git
- Branch naming: `feat/`, `fix/`, `docs/`, `refactor/`
- Commit messages: conventional commits (`feat:`, `fix:`, `docs:`, etc.)
- Always create PR for review, don't push directly to main

### Docker
- Use multi-stage builds (see `docs/research/k8s-deployment.md`)
- Base image: `oven/bun:1`
- Run as non-root user (`USER bun`)

## Research
All research docs are in `docs/research/`:
- `architecture.md` — Gateway patterns, semantic caching, provider adapters
- `competitors.md` — LiteLLM, Portkey, Cloudflare analysis
- `k8s-deployment.md` — GKE Autopilot, Redis, Docker, observability

## Key Decisions
1. **Vercel AI SDK** over raw HTTP — handles provider differences, streaming, tool calling
2. **Redis Stack** (self-hosted) over Memorystore — need RediSearch for vector similarity
3. **Hono** over Express — lighter, faster, better middleware pattern for this use case
4. **Biome** over ESLint — faster, simpler config

## Status
All implementation phases complete. The gateway supports:
- Multi-provider routing (OpenAI, Anthropic, Google)
- Semantic caching with Redis vector search
- Smart routing with rules engine, latency tracking, and cost scoring
- Automatic retry and provider fallback with circuit breaker
- Per-provider rate limiting (token bucket)
- Cost tracking with tiered alerts
- OpenTelemetry distributed tracing
- Graceful shutdown with connection draining
