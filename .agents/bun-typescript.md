# Bun Runtime — Best Practices & API Reference
> Source: bun.sh/docs official docs (Feb 2026)

## Overview
- All-in-one: runtime, package manager, test runner, bundler
- 4x faster startup than Node.js, built on Zig + JavaScriptCore
- Native TypeScript support (no build step needed)

## HTTP Server (Bun.serve)
```typescript
const server = Bun.serve({
  port: 3000,
  hostname: '0.0.0.0',
  fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/') return new Response('Hello Bun!')
    if (url.pathname === '/json') return Response.json({ message: 'Hello' })
    return new Response('Not Found', { status: 404 })
  },
  error(error) {
    return new Response('Internal Error', { status: 500 })
  }
})
console.log(`Server running at ${server.url}`)
```

## Hot Reload vs Watch
```bash
# --watch: Hard restart process on file changes (like nodemon)
bun --watch server.ts

# --hot: Soft reload, preserves state, HTTP servers stay alive
bun --hot server.ts
```

```typescript
// With --hot, globalThis persists across reloads
globalThis.count ??= 0
globalThis.count++
```

**Key difference:** `--watch` restarts entire process, `--hot` reloads code without restarting.

## Environment Variables
Bun auto-loads `.env` files (no `dotenv` needed):
- `.env` → `.env.{NODE_ENV}` → `.env.local` (in order of precedence)

```typescript
process.env.API_KEY       // Standard
Bun.env.API_KEY           // Same as process.env
import.meta.env.API_KEY   // Same as process.env
```

Auto-expansion in `.env`:
```bash
DB_USER=postgres
DB_PASSWORD=secret
DB_URL=postgres://$DB_USER:$DB_PASSWORD@localhost/mydb
```

Disable: `bun --no-env-file server.ts`

## Test Runner (bun:test)
```typescript
import { test, expect, describe, beforeAll, afterEach, mock } from 'bun:test'

describe('math', () => {
  beforeAll(() => console.log('Setup'))

  test('addition', () => {
    expect(2 + 2).toBe(4)
  })

  test('async', async () => {
    const result = await fetch('/api')
    expect(result.status).toBe(200)
  })
})
```

### Mocks
```typescript
import { mock } from 'bun:test'

const randomFn = mock(() => Math.random())
randomFn()
expect(randomFn).toHaveBeenCalled()
expect(randomFn).toHaveBeenCalledTimes(1)
```

### Run Commands
```bash
bun test                              # All tests
bun test --watch                      # Watch mode
bun test --test-name-pattern "add"    # Filter by name
bun test ./test/api.test.ts           # Specific file
bun test --timeout 10000              # Custom timeout
```

### Lifecycle Hooks
- `beforeAll()` / `afterAll()` — once per describe block
- `beforeEach()` / `afterEach()` — per test

## Package.json Scripts
```json
{
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bun test",
    "lint": "bunx biome check .",
    "format": "bunx biome format --write .",
    "check": "bunx biome check --write ."
  }
}
```

## tsconfig.json (Recommended)
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": { "@/*": ["./src/*"] },
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

## ⚠️ Gotchas
1. **--hot caveats** — state persists via `globalThis`, but module cache resets
2. **.env auto-loads** — `.env`, `.env.{NODE_ENV}`, `.env.local` (no dotenv needed)
3. **TypeScript built-in** — no tsconfig required to run, but recommended for strict mode
4. **Test file patterns** — looks for `*.test.{ts,tsx,js,jsx}` and `*.spec.*`
5. **bun run vs bun** — `bun run script` for package.json scripts, `bun file.ts` for direct exec

## Official Docs
- Main: https://bun.sh/docs
- HTTP Server: https://bun.sh/docs/runtime/http/server
- Watch Mode: https://bun.sh/docs/runtime/watch-mode
- Test Runner: https://bun.sh/docs/test
- Env Vars: https://bun.sh/docs/runtime/environment-variables
