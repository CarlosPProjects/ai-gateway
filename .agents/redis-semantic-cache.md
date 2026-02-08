# Redis Stack — Semantic Cache Patterns

## Setup (Docker Compose)
Use `redis/redis-stack:latest` for RediSearch + RedisJSON support.

## Vector Index Creation
```typescript
// Create index for semantic cache
await redis.ft.create('llm_cache_idx', {
  '$.vector': {
    type: SchemaFieldTypes.VECTOR,
    AS: 'vector',
    ALGORITHM: 'HNSW',
    TYPE: 'FLOAT32',
    DIM: 384, // Match your embedding model dimension
    DISTANCE_METRIC: 'COSINE',
  },
  '$.model': { type: SchemaFieldTypes.TAG, AS: 'model' },
  '$.created': { type: SchemaFieldTypes.NUMERIC, AS: 'created' },
}, { ON: 'JSON', PREFIX: 'cache:' });
```

## Cache Store
```typescript
async function storeInCache(query: string, model: string, response: string) {
  const vector = await generateEmbedding(query);
  const key = `cache:${crypto.randomUUID()}`;
  
  await redis.json.set(key, '$', {
    query,
    model,
    response,
    vector: Array.from(vector),
    created: Date.now(),
  });
  
  // TTL: 24 hours
  await redis.expire(key, 86400);
}
```

## Cache Lookup (KNN Search)
```typescript
async function searchCache(query: string, model: string, threshold = 0.95) {
  const vector = await generateEmbedding(query);
  const vectorBuffer = Buffer.from(new Float32Array(vector).buffer);
  
  const results = await redis.ft.search('llm_cache_idx', 
    `(@model:{${model}})=>[KNN 1 @vector $blob AS score]`, {
    PARAMS: { blob: vectorBuffer },
    SORTBY: 'score',
    LIMIT: { from: 0, size: 1 },
    RETURN: ['response', 'score'],
    DIALECT: 2,
  });

  if (results.total > 0) {
    const score = 1 - parseFloat(results.documents[0].value.score as string);
    if (score >= threshold) {
      return { hit: true, response: results.documents[0].value.response, score };
    }
  }
  return { hit: false };
}
```

## Embedding Options
| Model | Dimensions | Speed | Cost |
|-------|-----------|-------|------|
| `text-embedding-3-small` (OpenAI) | 1536 | Fast | $0.02/1M tokens |
| `all-MiniLM-L6-v2` (local ONNX) | 384 | Instant | Free |

**Recommendation:** Start with OpenAI embeddings for simplicity. Switch to local ONNX later for zero-cost.

## Similarity Thresholds
- **≥ 0.95**: Return cached response (functionally identical query)
- **0.85 - 0.95**: Log as "near miss" but don't return
- **< 0.85**: Full cache miss

## Cache Invalidation
- **TTL**: 24-48h default (LLM knowledge rots)
- **Model-scoped**: Cache per model, don't mix responses across models
- **Header override**: `X-Skip-Cache: true` to bypass cache
