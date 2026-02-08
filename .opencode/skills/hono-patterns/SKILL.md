---
name: hono-patterns
description: Hono v4+ web framework patterns including routing, middleware chains, streaming responses, Zod validation, error handling, and route groups. Use when implementing API routes or middleware.
---

## Hono v4+ — API Reference
> Source: hono.dev official docs (Feb 2026)

### Overview
- Under 14KB minified, zero dependencies, built on Web Standards
- Multi-runtime: Bun, Node.js, Cloudflare Workers, Deno
- RegExpRouter (fastest JS router) with SmartRouter fallback

### Basic Routing
```typescript
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => c.text('GET /'))
app.post('/', (c) => c.text('POST /'))

// Path parameters (typed)
app.get('/user/:name', (c) => {
  const name = c.req.param('name')
  return c.json({ name })
})

// Multiple params
app.get('/posts/:id/comment/:comment_id', (c) => {
  const { id, comment_id } = c.req.param()
  return c.json({ id, comment_id })
})

// Optional parameters
app.get('/api/animal/:type?', (c) => c.text('Animal!'))
```

### Route Groups
```typescript
const book = new Hono()
book.get('/', (c) => c.text('List Books'))
book.get('/:id', (c) => c.text('Get Book: ' + c.req.param('id')))
book.post('/', (c) => c.text('Create Book'))

const app = new Hono()
app.route('/book', book) // Mount under /book
```

### Context Object
```typescript
app.get('/api/posts', (c) => {
  const userAgent = c.req.header('User-Agent')
  const query = c.req.query('search')

  c.status(201)
  c.header('X-Custom', 'value')
  return c.json({ message: 'Created!' })
})

// Response helpers
c.text('Hello')           // text/plain
c.json({ key: 'val' })    // application/json
c.html('<h1>Hi</h1>')     // text/html
c.redirect('/login', 302)
c.notFound()
```

### Middleware
```typescript
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'

// Global
app.use(logger())

// Path-specific
app.use('/posts/*', cors())

// Custom middleware
app.use(async (c, next) => {
  console.log(`[${c.req.method}] ${c.req.url}`)
  await next()
  c.header('x-response-time', Date.now().toString())
})
```

### Streaming Responses
```typescript
import { stream, streamText, streamSSE } from 'hono/streaming'

// Server-Sent Events
app.get('/sse', (c) => {
  return streamSSE(c, async (stream) => {
    while (true) {
      await stream.writeSSE({
        data: new Date().toISOString(),
        event: 'time-update',
        id: String(Date.now())
      })
      await stream.sleep(1000)
    }
  })
})

// Text stream
app.get('/stream-text', (c) => {
  return streamText(c, async (stream) => {
    stream.onAbort(() => console.log('Aborted!'))
    await stream.writeln('Hello')
    await stream.sleep(1000)
    await stream.write('Hono!')
  })
})
```

### Validation with Zod
```typescript
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const schema = z.object({
  body: z.string().min(1),
  author: z.string()
})

app.post(
  '/posts',
  zValidator('json', schema),
  (c) => {
    const { body, author } = c.req.valid('json') // Type-safe!
    return c.json({ message: 'Created!', body, author }, 201)
  }
)
// Targets: 'json' | 'form' | 'query' | 'param' | 'header' | 'cookie'
```

### Error Handling
```typescript
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: { message: err.message } }, 500)
})

app.notFound((c) => {
  return c.json({ error: { message: 'Not Found' } }, 404)
})
```

### ⚠️ Gotchas
1. **Content-Type required** for JSON/form validation
2. **Header names lowercase** when validating
3. **Route order matters** — first match wins
4. **Grouping order** — call `route()` AFTER defining sub-routes

### Official Docs
- Main: https://hono.dev/docs
- API: https://hono.dev/docs/api
- Middleware: https://hono.dev/docs/guides/middleware
- Streaming: https://hono.dev/docs/helpers/streaming
