# Bun + TypeScript Best Practices

## Project Init
```bash
bun init
# Creates package.json, tsconfig.json, index.ts
```

## tsconfig.json (Strict)
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
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

## Environment Variables
Bun loads `.env` automatically. No need for `dotenv`.
```typescript
const apiKey = process.env.OPENAI_API_KEY; // Just works
```

## Testing with Bun
```typescript
// tests/router.test.ts
import { describe, it, expect, mock } from 'bun:test';

describe('Router', () => {
  it('should route to correct provider', () => {
    const result = selectProvider('gpt-4o');
    expect(result.provider).toBe('openai');
  });
});
```

Run: `bun test`

## Scripts (package.json)
```json
{
  "scripts": {
    "dev": "bun run --hot src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bun test",
    "lint": "bunx biome check .",
    "format": "bunx biome format --write .",
    "check": "bunx biome check --write ."
  }
}
```

## Performance Tips
- Use `Bun.serve()` or Hono's `export default { fetch, port }` pattern
- Prefer `Bun.file()` for file I/O (faster than fs)
- Use `bun:sqlite` for local storage if needed
- Hot reload: `bun run --hot` (not --watch)
