# Research: Building a Production AI Gateway with TypeScript, Bun, Hono & Vercel AI SDK

## Executive Summary
Building an AI Gateway allows you to unify multiple LLM providers (OpenAI, Anthropic, Gemini, etc.) behind a single control plane.
- **Bun**: Ultra-fast runtime/package manager, instant startup.
- **Hono**: Lightweight web framework with excellent middleware support, perfect for "chain of responsibility" pattern.
- **Vercel AI SDK**: Industry-standard abstraction layer, treating providers as swappable modules (`LanguageModel`).

---

## 1. Architecture Patterns
Production gateways (LiteLLM, Portkey, Kong) use a **Middleware Chain** architecture.

### The Request Lifecycle
1. **Ingress (OpenAI Compatible API)**: `POST /v1/chat/completions`
2. **Auth & Rate Limit**: Fast checks (Redis-backed).
3. **Semantic Cache Check**: Compute embedding → Vector search. Hit? Return immediately.
4. **Smart Routing**:
   - *Model Selection*: "User asked for 'gpt-4', but 'gpt-4o' is cheaper and faster. Swap it."
   - *Load Balancing*: "Azure OpenAI East is overloaded, route to West."
5. **Provider Adaptation**: Convert to specific provider format (Vercel AI SDK).
6. **Response Streaming**: Stream chunks back while asynchronously logging usage.

---

## 2. Semantic Caching

### Technology Stack
- **Database**: Redis Stack (RediSearch & RedisJSON)
- **Embedding Model**: OpenAI `text-embedding-3-small` (fast, cheap) or local ONNX `Xenova/all-MiniLM-L6-v2` (0 latency, no API cost)

### Implementation Strategy
1. **Hash**: Create vector embedding of incoming `messages` (last user prompt + system prompt).
2. **Search**: `FT.SEARCH` in Redis with KNN.
3. **Threshold**:
   - **> 0.95**: Safe to return (functionally identical).
   - **0.85 - 0.95**: Risky.
   - **< 0.85**: Cache miss.

### TTL Strategy
- **Time-based**: 24-48 hours. LLM responses "rot" as world knowledge changes.
- **LRU**: Evict least accessed vectors when memory fills.

```typescript
// Conceptual: Semantic Cache Check
async function checkCache(userQuery: string) {
  const vector = await embed(userQuery);
  const result = await redis.ft.search('llm_cache_idx', '@vector:[VECTOR_RANGE 0.05 $blob]', {
    PARAMS: { blob: vector.buffer },
    LIMIT: { from: 0, size: 1 },
    RETURN: ['response']
  });
  return result.documents[0]?.response || null;
}
```

---

## 3. Provider Adapters — The "Model Factory" Pattern

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const providers = {
  openai: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  anthropic: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  google: createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY }),
};

export function getModel(providerId: string, modelId: string) {
  const provider = providers[providerId as keyof typeof providers];
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  return provider(modelId);
}
```

---

## 4. Smart Routing

### Strategies
1. **Fallback (Resilience)**: Primary fails (5xx) → retry with backup.
2. **Least-Latency (Performance)**: Track P95 latency per provider in Redis. Route to fastest.
3. **Cost-Based (Optimization)**: Map internal names (`"premium"`) to cheapest viable model.

### Implementation Example (Hono + Vercel AI SDK)

```typescript
import { Hono } from 'hono';
import { streamText } from 'ai';
import { getModel } from './model-factory';

const app = new Hono();

const ROUTE_CONFIG = {
  'my-smart-model': {
    primary: { provider: 'anthropic', model: 'claude-3-5-sonnet-20240620' },
    fallback: { provider: 'openai', model: 'gpt-4o' }
  }
};

app.post('/v1/chat/completions', async (c) => {
  const body = await c.req.json();
  const requestedModel = body.model;
  const route = ROUTE_CONFIG[requestedModel] || { 
    primary: { provider: 'openai', model: requestedModel } 
  };

  try {
    const model = getModel(route.primary.provider, route.primary.model);
    const result = await streamText({ model, messages: body.messages });
    return result.toDataStreamResponse();
  } catch (err) {
    if (route.fallback) {
      const fallbackModel = getModel(route.fallback.provider, route.fallback.model);
      const result = await streamText({ model: fallbackModel, messages: body.messages });
      return result.toDataStreamResponse();
    }
    throw err;
  }
});
```

---

## 5. Rate Limiting & Production Features

- **Rate Limiting**: Upstash Ratelimit or local Redis. Token Bucket pattern. Key by API Key or User ID.
- **Virtual Keys**: Issue own API keys (`sk-mygateway...`) mapped to rate limits and allowed models.

## Recommended Stack
| Component | Choice | Why? |
| :--- | :--- | :--- |
| **Runtime** | Bun | Fast startup, native .env, native TypeScript |
| **Framework** | Hono | Standards-based, lightweight, Edge ready |
| **Orchestration** | Vercel AI SDK | Best abstraction, streaming, middleware hooks |
| **Cache DB** | Redis Stack | Rate Limiting + Vector Search |
| **Observability** | OpenTelemetry | Vercel AI SDK has built-in OTel support |
