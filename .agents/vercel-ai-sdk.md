# Vercel AI SDK Patterns for Multi-Provider Gateway

## Model Factory (Core Pattern)
```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

type ProviderConfig = {
  create: (...args: any[]) => any;
  apiKeyEnv: string;
};

const PROVIDERS: Record<string, ProviderConfig> = {
  openai: { create: createOpenAI, apiKeyEnv: 'OPENAI_API_KEY' },
  anthropic: { create: createAnthropic, apiKeyEnv: 'ANTHROPIC_API_KEY' },
  google: { create: createGoogleGenerativeAI, apiKeyEnv: 'GOOGLE_API_KEY' },
};

const instances = new Map();

export function getModel(providerId: string, modelId: string): LanguageModel {
  const key = `${providerId}:${modelId}`;
  if (!instances.has(key)) {
    const config = PROVIDERS[providerId];
    if (!config) throw new Error(`Unknown provider: ${providerId}`);
    const provider = config.create({ apiKey: process.env[config.apiKeyEnv] });
    instances.set(key, provider(modelId));
  }
  return instances.get(key);
}
```

## Streaming vs Non-Streaming
```typescript
import { streamText, generateText } from 'ai';

// Streaming (SSE)
const result = await streamText({ model, messages });
return result.toDataStreamResponse(); // Returns ReadableStream

// Non-streaming (JSON)
const result = await generateText({ model, messages });
return { choices: [{ message: { role: 'assistant', content: result.text } }] };
```

## Token Usage Tracking
```typescript
const result = await generateText({ model, messages });
const usage = {
  prompt_tokens: result.usage.promptTokens,
  completion_tokens: result.usage.completionTokens,
  total_tokens: result.usage.totalTokens,
};
```

## Error Handling per Provider
```typescript
import { APICallError } from 'ai';

try {
  const result = await streamText({ model, messages });
} catch (err) {
  if (err instanceof APICallError) {
    // err.statusCode — HTTP status from provider
    // err.message — Error message
    // err.isRetryable — Whether it's safe to retry
    if (err.isRetryable) {
      // Try fallback provider
    }
  }
}
```

## OpenTelemetry Integration
```typescript
const result = await generateText({
  model,
  messages,
  experimental_telemetry: {
    isEnabled: true,
    metadata: {
      userId: 'user-123',
      routeId: 'premium-route',
    },
  },
});
```

## Important: OpenAI Compatibility
The gateway must accept AND return OpenAI-format requests/responses.
Vercel AI SDK handles provider translation internally, but we must format
the final response to match OpenAI's API schema:
```typescript
interface OpenAIChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: 'assistant'; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
```
