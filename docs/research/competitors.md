# AI Gateway Competitive Analysis

## 1. Portkey (Best TypeScript Reference)
- **Architecture:** Built on Hono + Cloudflare Workers. Uses middleware chain pattern (`Log -> Cache -> RateLimit -> Route`).
- **Key Features:** Config-driven routing, simple/semantic caching, "guardrails" (input/output validation).
- **Takeaway:** Middleware chain pattern is perfect for our Hono-based project.

## 2. LiteLLM (Best Routing Logic)
- **Strength:** Excellent error normalization (mapping all provider errors to standard exceptions) and diverse routing strategies (weighted, latency-based, cost-based).
- **Takeaway:** Adopt their "Provider Adapter" pattern to normalize all inputs/outputs to the OpenAI format.

## 3. Cloudflare AI Gateway
- **Idea:** Header-based control (`cf-aig-skip-cache`) — clean pattern to allow clients to override gateway defaults without changing backend code.
- **Takeaway:** Implement header overrides for cache/retry behavior.

## 4. Martian
- **Conclusion:** "Predictive routing" based on model interpretability is too complex for this project.
- **Alternative:** Implement "Martian-Lite" using heuristic routing (e.g., regex matching "code" -> route to Claude Sonnet).

---

## Recommended Features Priority List

### Phase 1: Core ("Must Haves")
- [ ] **Unified API:** `/v1/chat/completions` (OpenAI format)
- [ ] **Provider Adapters:** OpenAI, Anthropic, Google
- [ ] **Round-Robin Routing:** Simple load balancing
- [ ] **Fallbacks:** If Provider A fails (5xx/429), try Provider B

### Phase 2: Optimization
- [ ] **In-Memory Caching:** Simple key-value store for identical requests
- [ ] **Token Bucket Rate Limiting:** Per-user/API-key limits
- [ ] **Header Overrides:** Allow clients to skip cache/retries

### Phase 3: Intelligence ("Nice to Haves")
- [ ] **Keyword Router:** Route based on prompt keywords (Code vs. Creative)
- [ ] **Cost Tracking:** Logging token usage per request
