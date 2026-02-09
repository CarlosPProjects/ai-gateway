import type { ProviderName } from "@/config/providers.ts";

/** Configuration for fallback and retry behavior */
export interface FallbackConfig {
	/** Maximum retries per provider before falling back to the next */
	maxRetries: number;
	/** Base delay for exponential backoff (ms) */
	baseBackoffMs: number;
	/** Maximum backoff delay cap (ms). Defaults to 10 000 */
	maxBackoffMs: number;
	/** Overall timeout for the entire fallback chain (ms). Defaults to 30 000 */
	totalTimeoutMs: number;
	/** Provider order override (defaults to the order passed to executeWithFallback) */
	providerOrder?: ProviderName[];
}

/** Record of a single retry or fallback attempt */
export interface RetryAttempt {
	/** Provider that was tried */
	provider: string;
	/** Error that occurred (null if successful) */
	error: Error | null;
	/** Time spent on this attempt (ms) */
	latencyMs: number;
	/** Timestamp when the attempt started */
	timestamp: number;
}

/** Result of a fallback execution, including metadata about the attempts */
export interface FallbackResult<T> {
	/** The successful result */
	result: T;
	/** Total number of attempts (retries + fallbacks) */
	attemptsUsed: number;
	/** Number of distinct providers tried */
	providersTriedCount: number;
	/** Full attempt log for observability */
	attempts: RetryAttempt[];
}
