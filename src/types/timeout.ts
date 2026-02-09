import type { ProviderName } from "@/config/providers.ts";

/** Per-provider timeout overrides (ms) */
export type ProviderTimeoutMap = Partial<Record<ProviderName, number>>;

/** Configuration for the timeout middleware */
export interface TimeoutConfig {
	/** Default timeout applied to all requests (ms) */
	defaultMs: number;
	/** Optional per-provider timeout overrides (ms) */
	perProvider?: ProviderTimeoutMap;
}

/** Error thrown when a request exceeds its timeout */
export class TimeoutError extends Error {
	/** HTTP status code for timeout responses */
	readonly status = 408;
	/** Timeout that was exceeded (ms) */
	readonly timeoutMs: number;
	/** Provider that was being called, if detected */
	readonly provider: string | null;

	constructor(timeoutMs: number, provider: string | null = null) {
		const providerInfo = provider ? ` (provider: ${provider})` : "";
		super(`Request timed out after ${timeoutMs}ms${providerInfo}`);
		this.name = "TimeoutError";
		this.timeoutMs = timeoutMs;
		this.provider = provider;
	}
}
