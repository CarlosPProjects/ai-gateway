import { APICallError } from "ai";

/** Maximum number of retries per provider before falling back to the next */
export const MAX_RETRIES = 2;

/** Base delay for exponential backoff (ms) */
export const BASE_BACKOFF_MS = 500;

/**
 * Determine whether an error is retryable.
 *
 * Retryable errors:
 *  - HTTP 5xx (server errors)
 *  - HTTP 429 (rate limit / too many requests)
 *  - Network timeouts and connection errors
 */
export function isRetryableError(error: unknown): boolean {
	// Vercel AI SDK wraps provider HTTP errors as APICallError
	if (error instanceof APICallError) {
		const status = error.statusCode;
		if (status !== undefined && status !== null) {
			return status === 429 || status >= 500;
		}
		// No status code means a network-level failure — retryable
		return true;
	}

	if (error instanceof Error) {
		const msg = error.message.toLowerCase();
		// Common timeout / network error signals
		if (
			msg.includes("timeout") ||
			msg.includes("timed out") ||
			msg.includes("econnreset") ||
			msg.includes("econnrefused") ||
			msg.includes("socket hang up") ||
			msg.includes("network") ||
			msg.includes("fetch failed") ||
			msg.includes("abort")
		) {
			return true;
		}
	}

	return false;
}

/**
 * Calculate exponential backoff delay with full jitter (AWS-style).
 *
 * Formula: random(0, min(cap, base * 2^attempt))
 * Full jitter prevents thundering-herd when multiple requests retry simultaneously.
 *
 * @param attempt  Zero-based retry attempt number
 * @param baseMs   Base delay in milliseconds (default: BASE_BACKOFF_MS)
 * @returns Delay in milliseconds
 */
export function calculateBackoff(attempt: number, baseMs: number = BASE_BACKOFF_MS): number {
	const maxDelay = 10_000; // 10 s cap
	const exponentialDelay = baseMs * 2 ** attempt;
	const capped = Math.min(exponentialDelay, maxDelay);

	// Full jitter: uniform random between 0 and capped value
	return Math.floor(Math.random() * capped);
}

/**
 * Sleep for the given number of milliseconds.
 * Extracted as a standalone function so tests can mock it.
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
