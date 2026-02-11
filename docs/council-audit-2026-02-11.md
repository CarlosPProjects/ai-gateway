# Council of Advisors — Security & Code Audit

**Date:** 2026-02-11
**Repository:** ai-gateway (Bun + Hono LLM proxy)
**Codebase:** 46 source files, ~5,000 LOC

## Models Used

| Model | Provider | Input (est.) | Output (est.) | Cost (est.) |
|-------|----------|-------------|---------------|-------------|
| Claude Opus 4.6 | Anthropic | ~50k tokens | ~3k tokens | ~$0.83 |
| Claude Sonnet 4.5 | Anthropic | ~50k tokens | ~4k tokens | ~$0.25 |
| Gemini 3 Pro | Google (API preview) | ~50k tokens | ~2.5k tokens | ~$0.08 |
| Kimi K2.5 | Moonshot (via OpenRouter) | ~50k tokens | ~3.5k tokens | ~$0.04 |
| **Total** | | | | **~$1.20** |

*Pricing: Opus $15/$75 per 1M in/out, Sonnet $3/$15, Gemini 3 Pro $1.25/$10, Kimi K2.5 $0.50/$2.50 (OpenRouter rates)*

## Methodology

Each model received the complete source code (~5k LOC across 46 files) plus an identical audit prompt. No model saw any other model's output. The orchestrator (Opus 4.6, running via OpenClaw) synthesized findings into consensus categories.

## Finding Summary

| Severity | Opus 4.6 | Sonnet 4.5 | Gemini 3 Pro | Kimi K2.5 |
|----------|----------|------------|-------------|-----------|
| Critical | 2 | 5 | 2 | 4 |
| High | 5 | 6 | 2 | 6 |
| Medium | 7 | 8 | 4 | 7 |
| Low | 7 | 8 | 3 | 8 |
| **Total** | **21** | **27** | **11** | **25** |

## Consensus Findings (3+ models agreed)

### Critical — No Authentication (4/4 models)

Every model flagged this as the #1 issue. The gateway has zero authentication — anyone who can reach the endpoint can proxy unlimited LLM requests at the operator's expense. No API keys, no JWT, no IP allowlist.

**Files:** `src/index.ts`, entire middleware chain
**Fix:** Add auth middleware as the first layer in `/v1/*`.

### Critical — Redis TAG Injection via Incomplete escapeTag() (4/4 models)

`escapeTag()` only escapes `.:-/` but Redis TAG queries have many more special characters (`{}|@*()!~"'`). A crafted model name could alter query semantics.

**File:** `src/services/cache/semantic-cache.ts`
**Fix:** Escape all Redis query special characters or validate model names against an allowlist pattern (`/^[a-zA-Z0-9._-]+$/`).

### High — Unbounded Client-Controlled Timeout via X-Timeout-Ms (4/4 models)

The `X-Timeout-Ms` header accepts any positive integer with no upper bound. A client can send `999999999` to effectively disable timeouts (DoS vector).

**File:** `src/middleware/timeout.ts`
**Fix:** Clamp to `Math.min(parsed, MAX_ALLOWED_TIMEOUT)` (e.g., 120s).

### High — Rate Limiter Bypass Vectors (3/4 models — Opus, Gemini, Kimi)

Rate limiter skips requests with: unknown providers, malformed bodies, missing model field. Combined with the lack of auth, this means no effective rate control.

**File:** `src/middleware/rate-limiter.ts`
**Fix:** Fail closed (reject) instead of fail open (skip) on unknown input.

### High — Circuit Breaker Half-Open Race Condition (4/4 models)

When the cooldown expires, multiple concurrent requests can all reset the circuit breaker simultaneously, flooding a potentially failing provider.

**File:** `src/routing/provider-registry.ts`
**Fix:** Implement proper half-open state allowing exactly one probe request.

### High — Unauthenticated Metrics/Cost Endpoints (3/4 models — Opus, Sonnet, Kimi)

`/metrics`, `/metrics/costs`, `/health` are publicly accessible. Cost data reveals provider usage patterns and API spend.

**File:** `src/routes/health.ts`
**Fix:** Protect behind auth or restrict to internal network.

### Medium — In-Memory Rate Limiting Won't Work in K8s (3/4 models — Gemini, Sonnet, Kimi)

Token buckets are in-memory `Map`. With N replicas, effective rate limit becomes N x limit. Pod restarts reset limits.

**File:** `src/utils/token-bucket.ts`
**Fix:** Move to Redis-backed rate limiting for distributed deployments.

### Medium — Streaming Responses Bypass Cost Tracking (3/4 models — Sonnet, Opus, Kimi)

When streaming, usage data may be unavailable. The cost tracker silently skips these, making `/metrics/costs` incomplete.

**File:** `src/routes/chat.ts`
**Fix:** Estimate tokens from streamed text when usage is unavailable.

### Medium — No Request Body Size Limits (3/4 models — Opus, Sonnet, Kimi)

No maximum body size validation. Attackers can send extremely large payloads to cause memory exhaustion.

**File:** `src/routes/chat.ts`, `src/types/index.ts`
**Fix:** Add Hono's `bodyLimit` middleware + Zod `.max()` on message content.

## Unique Findings (Only One Model Found)

### Opus 4.6 — Unique Insights

1. **`x-request-id` read from response headers before they're set** — tracing middleware reads `c.res.headers.get("x-request-id")` before the logging middleware sets it.
2. **`recordEmbeddingCall()` is dead code** — exported but never called, `embeddingCalls` counter is always 0.
3. **`reportError` records latency as 0** — pollutes latency statistics with zero values, making latency-based routing less accurate.
4. **Double timeout (middleware + route handler)** — streaming path creates its own `AbortController` independent from the middleware's, they're never linked.
5. **Default pricing silently applies to unknown models** — new models tracked at incorrect prices without warning.

### Sonnet 4.5 — Unique Insights

1. **Missing rate limit on embedding generation** — unlimited OpenAI embedding calls on cache misses (cost leak).
2. **Cost tracker validates but doesn't reject** — `validateTokenCounts()` returns `false` instead of throwing, silently skipping cost tracking.
3. **Redis connection pool leak on shutdown** — `client.quit()` can hang if Redis is unresponsive.
4. **No timeout on embedding API calls** — `generateEmbedding()` can block indefinitely.
5. **Cleartext logging of user queries** — GDPR/privacy concern for PII in messages.

### Gemini 3 Pro — Unique Insights

1. **Cost leak on client disconnect** — if a user aborts a request, the gateway continues processing the LLM stream, paying for tokens the user never receives.
2. **Cache response buffered entirely in memory** — `resClone.json()` buffers full completion, increasing GC pressure under high traffic.

### Kimi K2.5 — Unique Insights

1. **SSRF via OPENAI_BASE_URL** — OpenAI client respects env var for baseURL. Combined with missing auth, this is an SSRF vector.
2. **Cache key doesn't include temperature/max_tokens** — same messages with different params return cached responses from different settings.
3. **Floating point precision in cost calculation** — USD costs calculated with floats can have precision errors.

## Model Performance Analysis

| Metric | Opus 4.6 | Sonnet 4.5 | Gemini 3 Pro | Kimi K2.5 |
|--------|----------|------------|-------------|-----------|
| Total findings | 21 | 27 | 11 | 25 |
| Unique insights | 5 | 5 | 2 | 3 |
| Critical found | 2 | 5 | 2 | 4 |
| False positives | 0 | 0 | 0 | 0 |
| Ran tools (read files) | Yes | No | No | No |
| Runtime | ~2m | ~2m | ~1m | ~1.5m |
| Estimated cost | ~$0.83 | ~$0.25 | ~$0.08 | ~$0.04 |
| Cost per finding | ~$0.040 | ~$0.009 | ~$0.007 | ~$0.002 |

### Observations

**Opus 4.6** explored the actual codebase (read AGENTS.md, Dockerfile, .env.example, models.json) beyond what was provided in the prompt. It produced the most architecturally aware review with attention to how components interact. Found the double-timeout issue that requires understanding the middleware + route handler interaction. Best executive summary.

**Sonnet 4.5** produced the most findings (27) and the most actionable fix suggestions with complete code examples. Found embedding-specific issues (rate limiting, timeout, cost validation) that other models missed. Strongest on reliability concerns.

**Gemini 3 Pro** was the most concise (11 findings) but had zero false positives and identified the client-disconnect cost leak that no other model caught — a subtle but expensive production issue. Best signal-to-noise ratio.

**Kimi K2.5** found 25 issues including the SSRF vector via `OPENAI_BASE_URL` that all other models missed — a critical security finding. Also caught the cache key completeness issue. Strong security focus despite being the cheapest model.

## Disagreements

| Topic | Opus | Sonnet | Gemini | Kimi |
|-------|------|--------|--------|------|
| Memory growth severity | Medium | Critical | Medium | Critical |
| Rate limiter in K8s | Not flagged | Medium | Critical | Critical |
| Error message leakage | High | Medium | Not flagged | High |
| Dead code severity | Low | Low | Not flagged | Low |

The memory growth disagreement is notable: Sonnet and Kimi called it Critical (production DoS risk), while Opus and Gemini called it Medium (bounded by existing LRU/shift logic). The truth likely depends on traffic volume — at low traffic it's Medium, at high traffic it's Critical.

## Positive Observations (What's Done Well)

All 4 models independently praised:
- Excellent type safety with Zod + strict TypeScript (4/4)
- Clean middleware chain architecture with Hono (4/4)
- Proper graceful shutdown with SIGTERM handling (3/4)
- OpenTelemetry integration throughout (3/4)
- Exponential backoff with full jitter (3/4)
- Consistent OpenAI-compatible error format (4/4)

## Priority Remediation

### Immediate (before any deployment)
1. Add authentication middleware
2. Fix Redis escapeTag() injection
3. Clamp X-Timeout-Ms header
4. Protect /metrics endpoints

### Short-term (1-2 weeks)
5. Fix rate limiter bypass vectors
6. Fix circuit breaker race condition
7. Add request body size limits
8. Add timeout to embedding API calls

### Medium-term (1 month)
9. Move rate limiting to Redis for K8s
10. Fix streaming cost tracking gaps
11. Handle client disconnect to prevent cost leaks
12. Add cache key completeness (temperature, etc.)
