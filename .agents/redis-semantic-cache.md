# Redis Stack — Semantic Cache Patterns
> Source: redis.io official docs (Feb 2026)

## Setup
Use `redis/redis-stack:latest` for RediSearch + RedisJSON support.

## Client: node-redis (recommended over ioredis)
- `redis` package v4.6+ or v5.x — first-class TypeScript support for `.ft`, `.json` commands
- Fully compatible with Bun
- `ioredis` lacks built-in Redis Stack command types

```typescript
import { createClient, SchemaFieldTypes, VectorAlgorithms } from 'redis';

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
client.on('error', (err) => console.error('Redis Client Error', err));
await client.connect();
```

## Vector Index Creation (`FT.CREATE`)
- **Algorithm:** HNSW (preferred over FLAT for speed/recall)
- **Data Type:** JSON (`ON JSON`) with nested vector fields
- **Distance:** COSINE for text similarity
- **Dialect 2+** is mandatory for vector search syntax

```typescript
await client.ft.create('idx:semantic-cache', {
  '$.embedding': {
    type: SchemaFieldTypes.VECTOR,
    AS: 'vector',
    ALGORITHM: VectorAlgorithms.HNSW,
    TYPE: 'FLOAT32',
    DIM: 1536, // Must match embedding model
    DISTANCE_METRIC: 'COSINE'
  },
  '$.response': { type: SchemaFieldTypes.TEXT, AS: 'response' }
}, {
  ON: 'JSON',
  PREFIX: 'cache:'
});
```

## Cache Store
```typescript
async function cacheResponse(query: string, response: string) {
  const vector = await getEmbedding(query);
  const key = `cache:${Date.now()}`;

  await client.json.set(key, '$', {
    query,
    response,
    embedding: vector
  });

  // TTL: 24 hours
  await client.expire(key, 86400);
}
```

## Cache Lookup (KNN Search)
```typescript
// Convert number[] to Buffer for Redis
function float32Buffer(arr: number[]): Buffer {
  return Buffer.from(new Float32Array(arr).buffer);
}

async function semanticSearch(text: string) {
  const vector = await getEmbedding(text);

  const results = await client.ft.search(
    'idx:semantic-cache',
    `*=>[KNN 1 @vector $BLOB AS score]`,
    {
      PARAMS: { BLOB: float32Buffer(vector) },
      RETURN: ['score', 'response'],
      DIALECT: 2
    }
  );

  if (results.documents.length > 0) {
    const score = Number(results.documents[0].value.score);
    // Cosine DISTANCE: lower = more similar (0 = identical)
    if (score < 0.15) { // ~0.85 similarity
      return { hit: true, response: results.documents[0].value.response, score };
    }
  }
  return { hit: false };
}
```

## ⚠️ Important: Cosine Distance vs Similarity
- Redis returns **cosine distance** (0 = identical, 1 = opposite)
- NOT cosine similarity (1 = identical, 0 = orthogonal)
- Threshold of `< 0.15` distance ≈ `> 0.85` similarity
- For strict caching: use `< 0.05` distance (≈ 0.95 similarity)

## Embedding Options
| Model | Dimensions | Latency | Cost |
|-------|-----------|---------|------|
| OpenAI `text-embedding-3-small` | 1536 | ~100-200ms (network) | $0.02/1M tokens |
| `@xenova/transformers` `all-MiniLM-L6-v2` | 384 | <50ms (local) | Free |

**Recommendation:** Start with OpenAI for simplicity. Switch to local `@xenova/transformers` for zero-cost, zero-latency.

## Cache Invalidation
- **TTL**: 24-48h (LLM knowledge rots)
- **Model-scoped**: Don't mix responses across models
- **Header override**: `X-Skip-Cache: true` to bypass
- **LRU eviction**: Set `maxmemory-policy allkeys-lru` in redis.conf
