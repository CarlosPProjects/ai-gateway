import { createClient } from "redis";
import { cacheConfig } from "@/config/cache.ts";
import { logger } from "@/middleware/logging.ts";

export type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let isConnected = false;

/**
 * Get or create the singleton Redis client.
 * Handles auto-reconnect and error logging.
 */
export function getRedisClient(): RedisClient {
	if (client) return client;

	client = createClient({ url: cacheConfig.redisUrl });

	client.on("error", (err) => {
		isConnected = false;
		logger.error({ err: err.message }, "Redis client error");
	});

	client.on("connect", () => {
		logger.info("Redis client connected");
	});

	client.on("ready", () => {
		isConnected = true;
		logger.info("Redis client ready");
	});

	client.on("reconnecting", () => {
		isConnected = false;
		logger.warn("Redis client reconnecting");
	});

	client.on("end", () => {
		isConnected = false;
		logger.info("Redis client disconnected");
	});

	return client;
}

/**
 * Connect to Redis. Safe to call multiple times — will only connect once.
 */
export async function connectRedis(): Promise<void> {
	const redis = getRedisClient();

	if (redis.isOpen) return;

	try {
		await redis.connect();
	} catch (err) {
		logger.error(
			{ err: err instanceof Error ? err.message : String(err) },
			"Failed to connect to Redis",
		);
		throw err;
	}
}

/**
 * Gracefully disconnect from Redis.
 */
export async function disconnectRedis(): Promise<void> {
	if (client?.isOpen) {
		await client.quit();
		client = null;
		isConnected = false;
	}
}

/**
 * Check if Redis is connected and responsive.
 */
export async function isRedisHealthy(): Promise<boolean> {
	if (!client?.isOpen || !isConnected) return false;

	try {
		const pong = await client.ping();
		return pong === "PONG";
	} catch {
		return false;
	}
}
