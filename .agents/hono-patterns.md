# Hono Best Practices for AI Gateway

## Middleware Chain Pattern
Hono's middleware is perfect for the gateway's "interceptor" pattern.

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

const app = new Hono();

// Order matters: Auth → RateLimit → Cache → Route
app.use('*', cors());
app.use('*', logger());
app.use('/v1/*', authMiddleware);
app.use('/v1/*', rateLimitMiddleware);
app.use('/v1/chat/*', cacheMiddleware);
```

## Error Handling
```typescript
app.onError((err, c) => {
  if (err instanceof ProviderError) {
    return c.json({ error: { message: err.message, type: err.type, code: err.statusCode } }, err.statusCode);
  }
  return c.json({ error: { message: 'Internal server error', type: 'server_error' } }, 500);
});
```

## Streaming Responses
```typescript
import { streamText } from 'ai';

app.post('/v1/chat/completions', async (c) => {
  const body = await c.req.json();
  const stream = body.stream ?? false;

  if (stream) {
    const result = await streamText({ model, messages: body.messages });
    return result.toDataStreamResponse();
  } else {
    const result = await generateText({ model, messages: body.messages });
    return c.json(formatOpenAIResponse(result));
  }
});
```

## Route Groups
```typescript
const v1 = new Hono();
v1.post('/chat/completions', chatHandler);
v1.get('/models', modelsHandler);

const internal = new Hono();
internal.get('/health', healthHandler);
internal.get('/metrics', metricsHandler);

app.route('/v1', v1);
app.route('/', internal);
```

## Type-Safe Request Validation
```typescript
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const chatSchema = z.object({
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
});

app.post('/v1/chat/completions', zValidator('json', chatSchema), chatHandler);
```
