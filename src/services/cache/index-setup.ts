import { SCHEMA_FIELD_TYPE, SCHEMA_VECTOR_FIELD_ALGORITHM } from "redis";
import { cacheConfig } from "@/config/cache.ts";
import { logger } from "@/middleware/logging.ts";
import { getRedisClient } from "./redis.ts";

/**
 * Create the Redis vector index for semantic cache.
 * Uses HNSW algorithm with COSINE distance on JSON documents.
 * Handles "Index already exists" gracefully.
 */
export async function ensureVectorIndex(): Promise<void> {
	const client = getRedisClient();

	try {
		await client.ft.create(
			cacheConfig.indexName,
			{
				"$.embedding": {
					type: SCHEMA_FIELD_TYPE.VECTOR,
					AS: "vector",
					ALGORITHM: SCHEMA_VECTOR_FIELD_ALGORITHM.HNSW,
					TYPE: "FLOAT32",
					DIM: cacheConfig.embeddingDimensions,
					DISTANCE_METRIC: "COSINE",
				},
				"$.model": {
					type: SCHEMA_FIELD_TYPE.TAG,
					AS: "model",
				},
				"$.query": {
					type: SCHEMA_FIELD_TYPE.TEXT,
					AS: "query",
				},
			},
			{
				ON: "JSON",
				PREFIX: cacheConfig.keyPrefix,
			},
		);

		logger.info(
			{ index: cacheConfig.indexName, dim: cacheConfig.embeddingDimensions },
			"Vector index created",
		);
	} catch (err: unknown) {
		if (err instanceof Error && err.message === "Index already exists") {
			logger.debug({ index: cacheConfig.indexName }, "Vector index already exists");
			return;
		}
		throw err;
	}
}
