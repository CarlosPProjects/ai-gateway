import type { MiddlewareHandler } from "hono";
import type { ProviderName } from "@/config/providers.ts";
import { logger } from "@/middleware/logging.ts";
import { detectProvider } from "@/services/providers/index.ts";
import type { TimeoutConfig } from "@/types/timeout.ts";
import { TimeoutError } from "@/types/timeout.ts";

/**
 * Request timeout middleware for the AI Gateway.
 *
 * Uses AbortController to enforce per-request timeouts. The effective timeout
 * is resolved in order of priority:
 *   1. `X-Timeout-Ms` request header (per-request override)
 *   2. Per-provider timeout from config (based on detected model provider)
 *   3. Default timeout passed to the factory
 *
 * On timeout:
 *   - Aborts the request via AbortController signal
 *   - Returns 408 Request Timeout in OpenAI-compatible error format
 *   - Logs timeout event with provider and model context
 *
 * Sets `c.set('abortSignal', signal)` so downstream handlers (e.g. Vercel AI SDK
 * streamText/generateText) can pass the signal for cooperative cancellation.
 */
export function timeoutMiddleware(defaultTimeoutMs: number): MiddlewareHandler {
	return async (c, next) => {
		const config: TimeoutConfig = { defaultMs: defaultTimeoutMs };

		// --- Resolve effective timeout ---
		let effectiveTimeout = config.defaultMs;
		let provider: ProviderName | null = null;

		// Check per-provider timeout: try to detect provider from body model field
		// We parse the model from the request body for POST chat completions
		if (c.req.method === "POST" && c.req.path.endsWith("/v1/chat/completions")) {
			try {
				const body = await c.req.json();
				if (body?.model) {
					provider = detectProvider(body.model);
					if (provider && config.perProvider?.[provider] !== undefined) {
						effectiveTimeout = config.perProvider[provider] as number;
					}
				}
			} catch {
				// Body parse failure — use default timeout; route handler will handle validation
			}
		}

		// Per-request override via header (highest priority)
		const headerTimeout = c.req.header("X-Timeout-Ms");
		if (headerTimeout) {
			const parsed = Number.parseInt(headerTimeout, 10);
			if (!Number.isNaN(parsed) && parsed > 0) {
				effectiveTimeout = parsed;
			} else {
				logger.warn(
					{ headerValue: headerTimeout },
					"Invalid X-Timeout-Ms header value — using default timeout",
				);
			}
		}

		// --- Set up AbortController ---
		const controller = new AbortController();
		const { signal } = controller;

		// Expose signal to downstream handlers
		c.set("abortSignal", signal);

		// Schedule the abort
		const timer = setTimeout(() => {
			if (!signal.aborted) {
				controller.abort(new TimeoutError(effectiveTimeout, provider));
			}
		}, effectiveTimeout);

		try {
			await next();
		} catch (err) {
			// If the error is a timeout we triggered, return 408
			if (err instanceof TimeoutError || signal.aborted) {
				const timeoutErr =
					err instanceof TimeoutError ? err : new TimeoutError(effectiveTimeout, provider);

				logger.warn(
					{
						timeoutMs: timeoutErr.timeoutMs,
						provider: timeoutErr.provider,
						method: c.req.method,
						path: c.req.path,
					},
					"Request timed out",
				);

				return c.json(
					{
						error: {
							message: timeoutErr.message,
							type: "timeout_error",
							code: 408,
							provider: timeoutErr.provider,
						},
					},
					408,
				);
			}

			// Re-throw non-timeout errors for the global error handler
			throw err;
		} finally {
			// Always clean up the timer and controller
			clearTimeout(timer);
			if (!signal.aborted) {
				controller.abort();
			}
		}
	};
}
