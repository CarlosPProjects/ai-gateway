# AGENTS.md — AI Gateway

## Project Overview
Intelligent LLM Router with semantic caching, deployed on GKE Autopilot.
- **Stack:** TypeScript, Bun, Hono, Vercel AI SDK, Redis Stack
- **Repo:** CarlosPProjects/ai-gateway
- **Package Manager:** Bun (NOT npm/pnpm)

## Architecture
Middleware Chain pattern (inspired by Portkey/LiteLLM):
```
Request → Auth → RateLimit → Cache Check → Router → Provider Adapter → LLM API
                                                         ↓
Response ← Logging ← Cost Track ← Cache Store ← Stream ← LLM Response
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
├── index.ts              # Entry point (Hono app)
├── routes/               # Route handlers
├── services/
│   ├── router/           # Smart routing logic
│   ├── cache/            # Semantic caching (Redis + embeddings)
│   └── providers/        # LLM provider adapters (Model Factory)
├── middleware/            # Hono middleware (logging, rate limit, auth)
├── config/               # Configuration management
└── types/                # Shared TypeScript types
```

### Patterns
- **Model Factory:** Dynamic provider registry using Vercel AI SDK. See `docs/research/architecture.md`.
- **Provider Adapters:** All I/O normalized to OpenAI format. Vercel AI SDK handles the translation.
- **Middleware Chain:** Hono middlewares for auth → rate limit → cache → route → respond.
- **Error Handling:** Normalize all provider errors to standard HTTP errors (inspired by LiteLLM).

### Testing
- Use `bun test` (built-in test runner)
- Tests go in `tests/` directory
- Mock external APIs (never call real LLM APIs in tests)

### Environment Variables
- Copy `.env.example` → `.env`
- Never commit `.env` or real API keys
- Use `process.env.VARIABLE_NAME` (Bun loads .env automatically)

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
