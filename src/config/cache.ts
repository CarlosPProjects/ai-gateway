/**
 * Cache configuration — loaded from environment variables.
 * Controls Redis connection, TTL, similarity threshold, and embedding model.
 */
export const cacheConfig = {
	/** Whether semantic caching is enabled */
	enabled: process.env.CACHE_ENABLED !== "false",

	/** Redis connection URL */
	redisUrl: process.env.REDIS_URL || "redis://localhost:6379",

	/** Cache TTL in seconds (default: 1 hour) */
	ttlSeconds: Number.parseInt(process.env.CACHE_TTL_SECONDS || "3600", 10),

	/**
	 * Cosine distance threshold for cache hits.
	 * Lower = stricter matching. Redis uses cosine DISTANCE (0 = identical, 1 = opposite).
	 * Default 0.15 ≈ 0.85 similarity.
	 */
	similarityThreshold: Number.parseFloat(process.env.CACHE_SIMILARITY_THRESHOLD || "0.15"),

	/** OpenAI embedding model */
	embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-3-small",

	/** Embedding dimensions (must match the model) */
	embeddingDimensions: Number.parseInt(process.env.EMBEDDING_DIMENSIONS || "1536", 10),

	/** Redis index name for vector search */
	indexName: "idx:semantic-cache",

	/** Redis key prefix for cached entries */
	keyPrefix: "cache:",
} as const;
