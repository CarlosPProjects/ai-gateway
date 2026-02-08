---
name: vercel-ai-sdk
description: Vercel AI SDK patterns for multi-provider LLM abstraction including streamText, generateText, provider setup, error handling, token tracking, and OpenTelemetry. Use when implementing LLM provider adapters or streaming responses.
---

## Vercel AI SDK — Multi-Provider Patterns
> Source: ai-sdk.dev official docs (Feb 2026)

### Architecture
- **AI SDK Core:** Unified API for text generation, tools, agents
- **AI SDK UI:** Framework hooks for chat/generative UI
- **Provider packages:** `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`

### Provider Setup
```typescript
// Provider/model string format
import { generateText } from 'ai'
const { text } = await generateText({
  model: 'anthropic/claude-sonnet-4.5',
  prompt: 'Hello'
})

// Or with provider instances
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'

const model = anthropic('claude-sonnet-4.5')
const gptModel = openai('gpt-5')
const geminiModel = google('gemini-2.0-flash-exp')
```

### Text Generation (Non-Streaming)
```typescript
import { generateText } from 'ai'

const result = await generateText({
  model: 'anthropic/claude-sonnet-4.5',
  system: 'You are a professional writer.',
  prompt: `Summarize: ${article}`,
  maxTokens: 500,
  temperature: 0.7
})

result.text          // Generated text
result.finishReason  // 'stop' | 'length' | 'tool-calls'
result.usage         // { promptTokens, completionTokens, totalTokens }
result.response      // { headers, body, messages }
```

### Streaming Text
```typescript
import { streamText } from 'ai'

const result = streamText({
  model: 'anthropic/claude-sonnet-4.5',
  prompt: 'Describe a holiday',
  onChunk({ chunk }) {
    if (chunk.type === 'text') console.log(chunk.text)
  },
  onFinish({ text, usage, finishReason }) {
    console.log('Done!', { text, usage })
  },
  onError({ error }) {
    console.error('Error:', error) // ⚠️ Errors don't throw in streams!
  }
})

// Consume stream (AsyncIterable)
for await (const textPart of result.textStream) {
  process.stdout.write(textPart)
}

// Or fullStream for all events
for await (const part of result.fullStream) {
  switch (part.type) {
    case 'text-delta': console.log(part.text); break
    case 'tool-call': console.log(part.toolName); break
    case 'error': console.error(part.error); break
    case 'finish': console.log('Done!'); break
  }
}

// Promises that resolve when stream finishes
await result.text
await result.usage
await result.finishReason
```

### Error Handling
```typescript
import { APICallError } from 'ai'

// generateText: try/catch
try {
  const { text } = await generateText({ model, prompt: 'Hello' })
} catch (error) {
  if (error instanceof APICallError) {
    error.message      // Error message
    error.statusCode   // HTTP status
    error.responseBody // Raw response
  }
}

// streamText: use onError callback (errors DON'T throw!)
const result = streamText({
  model,
  prompt: 'Hello',
  onError({ error }) {
    console.error('Stream error:', error)
  }
})
```

### Stream Abort
```typescript
const result = streamText({
  model,
  prompt: 'Write a long story',
  onAbort({ steps }) {
    console.log('Aborted after', steps.length, 'steps')
  },
  onFinish({ text }) {
    // Only called on NORMAL completion, NOT abort
  }
})
```

### Model Factory Pattern (for Gateway)
```typescript
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'

const providers = {
  openai: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  anthropic: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  google: createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY }),
}

export function getModel(providerId: string, modelId: string): LanguageModel {
  const provider = providers[providerId as keyof typeof providers]
  if (!provider) throw new Error(`Unknown provider: ${providerId}`)
  return provider(modelId)
}
```

### OpenTelemetry
```typescript
const result = await generateText({
  model,
  messages,
  experimental_telemetry: {
    isEnabled: true,
    metadata: { userId: 'user-123', routeId: 'premium' },
  },
})
```

### ⚠️ Gotchas
1. **Errors don't throw in streams** — use `onError` callback
2. **Backpressure** — MUST consume the stream
3. **onFinish NOT called on abort** — use `onAbort` separately
4. **streamText starts immediately** — no await needed to begin
5. **Provider string format** — `'provider/model'`

### Official Docs
- Main: https://ai-sdk.dev/docs
- Generating Text: https://ai-sdk.dev/docs/ai-sdk-core/generating-text
- Streaming: https://ai-sdk.dev/docs/ai-sdk-core/streaming-text
- Error Handling: https://ai-sdk.dev/docs/ai-sdk-core/error-handling
- Providers: https://ai-sdk.dev/docs/foundations/providers-and-models
