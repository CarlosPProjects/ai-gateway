# Phase 3: Smart Routing — Research & Implementation Plan

## Current Architecture (from codebase analysis)

### Request Flow
1. `src/index.ts` → Hono app entry
2. Middleware chain: `requestLogger` → `semanticCacheMiddleware` → `errorHandler`
3. Routes: `/v1/chat/completions` (chat.ts), `/health` + `/metrics` (health.ts)
4. Provider selection: `routeModel(model)` in `src/services/router/index.ts`
5. Providers: OpenAI, Anthropic, Google via Vercel AI SDK adapters

### Current Provider Selection
- `src/config/routes.ts` — defines `RouteConfig` with primary + fallback targets
- `src/services/router/index.ts` — `routeModel()` resolves model string → provider
- `src/services/providers/index.ts` — `detectProvider()` by model prefix, `getModel()` creates SDK instance
- Each provider (anthropic.ts, openai.ts, google.ts) has singleton pattern

### Integration Points for Phase 3
- **Routing rules** → Replace/extend `routeModel()` in router service
- **Rate limiting** → New middleware or pre-selection filter
- **Fallback** → Extend existing `fallbacks` in RouteConfig
- **Latency tracking** → Wrap provider calls, store in Redis or in-memory
- **Timeout** → New Hono middleware before route handlers

---

## Research Findings

### Routing Strategies (from LiteLLM, Portkey analysis)

**LiteLLM approach:**
- Router with model list + routing strategies
- Strategies: `simple-shuffle`, `least-busy`, `latency-based-routing`, `cost-based-routing`
- Each deployment has RPM/TPM limits
- Fallbacks defined per model with retry logic
- Architecture: Fallbacks → Retries → Timeouts → Cooldowns

**Recommended for us:**
- Start with cost-based + latency-based routing
- Use capability matching for model selection
- Keep it simpler than LiteLLM (we're not a proxy platform)

### Rate Limiting
- **Redis-based token bucket** (we already have Redis) — best fit
- Libraries: `node-rate-limiter` (in-memory) or custom Redis implementation
- LiteLLM uses Redis for distributed rate limiting with TPM/RPM counters

### Fallback/Retry
- **Circuit breaker** (opossum library) for provider health tracking
- Exponential backoff: 100ms → 200ms → 400ms (max 3 retries)
- On 5xx/429: retry same provider, then fallback to next
- Streaming retries: can't retry mid-stream, must restart from beginning

### Latency Tracking
- **EMA (Exponential Moving Average)** — recommended for irregular intervals
- Formula: `new_avg = alpha * sample + (1-alpha) * old_avg`
- Alpha = 0.3 gives good responsiveness
- Store per-provider, per-model in Redis or in-memory

### Cost Modeling
- Static pricing config (JSON file like LiteLLM's `model_prices_and_context_window.json`)
- Calculate: `(input_tokens * input_price + output_tokens * output_price) / 1000`
- Update pricing periodically

---

## Implementation Plan: 7 Parallel Workstreams

### Merge Order (sequential dependencies)
1. **Foundation** → Types & interfaces (must merge first)
2-6. **Parallel** → Rate Limiter, Latency Tracker, Timeout, Routing Rules, Fallback
7. **Model Selector** → Orchestrator (depends on all above)

### Workstream 1: Foundation Types (S)
**Branch:** `feat/phase-3-foundation`
**New files:**
- `src/types/routing.ts` — RoutingRule, RuleCondition, RankedProvider
- `src/types/metrics.ts` — LatencyMetric
- `src/types/provider.ts` — ProviderState
- `src/config/routing-config.ts` — Zod schema for routing config

### Workstream 2: Rate Limiter (M)
**Branch:** `feat/phase-3-rate-limiter`
**New files:**
- `src/providers/rate-limiter.ts` — Token bucket per provider
- `src/providers/rate-limiter.test.ts`
**Depends on:** Workstream 1

### Workstream 3: Latency Tracker (M)
**Branch:** `feat/phase-3-latency-tracker`
**New files:**
- `src/metrics/latency-tracker.ts` — EMA + rolling window
- `src/metrics/aggregator.ts` — p50/p95/p99
- `src/metrics/latency-tracker.test.ts`
**Depends on:** Workstream 1

### Workstream 4: Timeout Middleware (S)
**Branch:** `feat/phase-3-timeout-handler`
**New files:**
- `src/middleware/timeout.ts` — AbortController-based
- `src/middleware/timeout.test.ts`
**Depends on:** Nothing

### Workstream 5: Routing Rules Engine (L)
**Branch:** `feat/phase-3-routing-rules`
**New files:**
- `src/routing/rules-engine.ts` — Rule evaluation + scoring
- `src/routing/rule-evaluator.ts` — Individual rule logic
- `src/routing/rules-engine.test.ts`
**Depends on:** Workstream 1

### Workstream 6: Fallback Handler (L)
**Branch:** `feat/phase-3-fallback-handler`
**New files:**
- `src/middleware/fallback.ts` — Retry + provider fallback
- `src/routing/retry-strategy.ts` — Backoff logic
- `src/middleware/fallback.test.ts`
**Depends on:** Workstream 1

### Workstream 7: Model Selector (M) — LAST
**Branch:** `feat/phase-3-model-selector`
**New files:**
- `src/routing/model-selector.ts` — Orchestrates all components
- `src/routing/model-selector.test.ts`
**Depends on:** ALL above

---

## Conflict Risk: 🟢 LOW
- Workstreams 2-6 touch completely different files
- Only Model Selector imports from others
- Foundation merged first prevents type conflicts

## Execution with Git Worktrees
```bash
# After foundation is merged:
git worktree add ../phase3-rate-limiter feat/phase-3-rate-limiter
git worktree add ../phase3-latency feat/phase-3-latency-tracker
git worktree add ../phase3-timeout feat/phase-3-timeout-handler
git worktree add ../phase3-rules feat/phase-3-routing-rules
git worktree add ../phase3-fallback feat/phase-3-fallback-handler
```
