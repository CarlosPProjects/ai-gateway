import { logger } from "@/middleware/logging.ts";
import type { FallbackConfig, FallbackResult, RetryAttempt } from "@/types/fallback.ts";
import {
	BASE_BACKOFF_MS,
	calculateBackoff,
	isRetryableError,
	MAX_RETRIES,
	sleep,
} from "./retry-strategy.ts";

/** Default fallback configuration */
const DEFAULT_CONFIG: FallbackConfig = {
	maxRetries: MAX_RETRIES,
	baseBackoffMs: BASE_BACKOFF_MS,
};

/**
 * Aggregated error thrown when every provider in the fallback chain has been
 * exhausted. Carries the full attempt log so callers can inspect individual
 * failures.
 */
export class AllProvidersFailedError extends Error {
	public readonly attempts: RetryAttempt[];
	public readonly statusCode = 503;

	constructor(attempts: RetryAttempt[]) {
		const providersSummary = [...new Set(attempts.map((a) => a.provider))].join(", ");

		super(
			`All providers exhausted. Tried: [${providersSummary}] ` +
				`across ${attempts.length} attempt(s). ` +
				`Last error: ${attempts[attempts.length - 1]?.error?.message ?? "unknown"}`,
		);

		this.name = "AllProvidersFailedError";
		this.attempts = attempts;
	}
}

/**
 * FallbackHandler orchestrates retries within a single provider and failover
 * across an ordered list of providers.
 *
 * Flow per provider:
 *   1. Call `executeFn(provider)`
 *   2. On retryable error → backoff & retry up to `maxRetries`
 *   3. On non-retryable error or retries exhausted → move to next provider
 *   4. If every provider fails → throw `AllProvidersFailedError` (HTTP 503)
 */
export class FallbackHandler {
	private readonly config: FallbackConfig;

	constructor(
		private readonly providers: string[],
		config?: Partial<FallbackConfig>,
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Execute an operation with automatic retry and provider fallback.
	 *
	 * @param providers  Ordered provider list (first = preferred)
	 * @param executeFn  Async function that performs the work for a given provider
	 * @returns          The successful result wrapped with attempt metadata
	 */
	async executeWithFallback<T>(
		providers: string[],
		executeFn: (provider: string) => Promise<T>,
	): Promise<FallbackResult<T>> {
		const attempts: RetryAttempt[] = [];
		const providerList = providers.length > 0 ? providers : this.providers;

		for (const provider of providerList) {
			const result = await this.tryProvider<T>(provider, executeFn, attempts);
			if (result !== undefined) {
				return {
					result,
					attemptsUsed: attempts.length,
					providersTriedCount: new Set(attempts.map((a) => a.provider)).size,
					attempts,
				};
			}
		}

		// Every provider in the chain has failed
		logger.error({
			type: "fallback_exhausted",
			providers: providerList,
			totalAttempts: attempts.length,
			errors: attempts.map((a) => ({
				provider: a.provider,
				error: a.error?.message,
				latencyMs: a.latencyMs,
			})),
		});

		throw new AllProvidersFailedError(attempts);
	}

	/**
	 * Try a single provider with retries. Returns `undefined` when all retries
	 * for this provider are exhausted (signalling the caller to fall back).
	 */
	private async tryProvider<T>(
		provider: string,
		executeFn: (provider: string) => Promise<T>,
		attempts: RetryAttempt[],
	): Promise<T | undefined> {
		const maxAttempts = this.config.maxRetries + 1; // first try + retries

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const start = Date.now();

			try {
				const result = await executeFn(provider);

				// Record successful attempt
				attempts.push({
					provider,
					error: null,
					latencyMs: Date.now() - start,
					timestamp: start,
				});

				logger.info({
					type: "fallback_success",
					provider,
					attempt: attempt + 1,
					latencyMs: Date.now() - start,
				});

				return result;
			} catch (err) {
				const latencyMs = Date.now() - start;
				const error = err instanceof Error ? err : new Error(String(err));

				attempts.push({
					provider,
					error,
					latencyMs,
					timestamp: start,
				});

				const retryable = isRetryableError(err);
				const hasRetriesLeft = attempt < this.config.maxRetries;

				if (retryable && hasRetriesLeft) {
					const backoff = calculateBackoff(attempt, this.config.baseBackoffMs);

					logger.warn({
						type: "fallback_retry",
						provider,
						attempt: attempt + 1,
						maxRetries: this.config.maxRetries,
						backoffMs: backoff,
						error: error.message,
					});

					await sleep(backoff);
					continue;
				}

				// Non-retryable or retries exhausted → fall back to next provider
				logger.warn({
					type: retryable ? "fallback_retries_exhausted" : "fallback_non_retryable",
					provider,
					attempt: attempt + 1,
					error: error.message,
					movingToNextProvider: true,
				});

				return undefined;
			}
		}

		return undefined;
	}
}
