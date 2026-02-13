/**
 * Provider latency tracker with EMA and percentile support.
 *
 * Keeps a bounded rolling window of latency samples per provider
 * and maintains an exponential moving average for fast routing decisions.
 */

import type { ProviderName } from "@/config/providers.ts";
import { logger } from "@/middleware/logging.ts";
import type { LatencyRecord, LatencyStats } from "@/types/metrics.ts";
import { calculateEma, calculatePercentiles } from "./aggregator.ts";

/* ------------------------------------------------------------------ */
/*  Circular buffer — O(1) push, O(n) snapshot (no shift penalty)     */
/* ------------------------------------------------------------------ */

/**
 * Fixed-capacity circular buffer backed by a pre-allocated array.
 * Avoids the O(n) cost of Array.shift() in the hot path.
 */
class CircularBuffer<T> {
	private readonly buf: (T | undefined)[];
	private head = 0; // next write position
	private count = 0;
	readonly capacity: number;

	constructor(capacity: number) {
		this.capacity = capacity;
		this.buf = new Array<T | undefined>(capacity);
	}

	/** Push a value, overwriting the oldest entry when full. */
	push(value: T): void {
		this.buf[this.head] = value;
		this.head = (this.head + 1) % this.capacity;
		if (this.count < this.capacity) this.count++;
	}

	/** Number of values currently stored. */
	get length(): number {
		return this.count;
	}

	/** Return a dense snapshot in insertion order. */
	toArray(): T[] {
		if (this.count === 0) return [];
		const out: T[] = new Array(this.count);
		// The oldest entry is at (head - count) mod capacity
		const start = (this.head - this.count + this.capacity) % this.capacity;
		for (let i = 0; i < this.count; i++) {
			out[i] = this.buf[(start + i) % this.capacity] as T;
		}
		return out;
	}

	/** Reset the buffer. */
	clear(): void {
		this.head = 0;
		this.count = 0;
		this.buf.fill(undefined);
	}
}

/* ------------------------------------------------------------------ */
/*  Internal per-provider state                                        */
/* ------------------------------------------------------------------ */

interface ProviderLatencyState {
	/** Rolling window of totalMs samples for *successful* requests only. */
	samples: CircularBuffer<number>;
	/** Current EMA value (ms) — only updated on success. */
	ema: number;
	/** Whether EMA has been initialised with at least one successful sample. */
	initialised: boolean;
	/** Full latency records for introspection (success + failure). */
	records: CircularBuffer<LatencyRecord>;
	/** Timestamp of the last recorded sample. */
	lastUpdated: number;
}

/* ------------------------------------------------------------------ */
/*  LatencyTracker                                                     */
/* ------------------------------------------------------------------ */

/**
 * Provider latency tracker with EMA and percentile support.
 *
 * Keeps a bounded rolling window of latency samples per provider
 * and maintains an exponential moving average for fast routing decisions.
 */
export class LatencyTracker {
	private readonly state = new Map<ProviderName, ProviderLatencyState>();
	private readonly windowSize: number;
	private readonly alpha: number;

	constructor(opts?: { windowSize?: number; alpha?: number }) {
		this.windowSize = opts?.windowSize ?? 100;
		this.alpha = opts?.alpha ?? 0.3;

		logger.debug({
			msg: "LatencyTracker initialised",
			windowSize: this.windowSize,
			alpha: this.alpha,
		});
	}

	/* ------------------------------------------------------------------ */
	/*  Write path                                                         */
	/* ------------------------------------------------------------------ */

	/**
	 * Record a latency measurement for a provider.
	 *
	 * - Records are *always* stored for introspection (success and failure).
	 * - Samples and EMA are only updated for **successful** requests so that
	 *   timeouts / fast 4xx errors don't pollute routing decisions.
	 * - NaN / Infinity values are rejected to prevent EMA poisoning.
	 */
	recordLatency(
		provider: ProviderName,
		modelId: string,
		ttfbMs: number,
		totalMs: number,
		success: boolean,
	): void {
		// Guard: reject non-finite values to prevent EMA poisoning
		if (!Number.isFinite(ttfbMs) || !Number.isFinite(totalMs)) {
			logger.warn({
				msg: "latency value rejected — non-finite input",
				provider,
				modelId,
				ttfbMs,
				totalMs,
			});
			return;
		}

		const now = Date.now();

		const record: LatencyRecord = {
			provider,
			modelId,
			ttfbMs,
			totalMs,
			timestamp: now,
			success,
		};

		let providerState = this.state.get(provider);

		if (!providerState) {
			providerState = {
				samples: new CircularBuffer<number>(this.windowSize),
				ema: 0,
				initialised: false,
				records: new CircularBuffer<LatencyRecord>(this.windowSize),
				lastUpdated: now,
			};
			this.state.set(provider, providerState);
		}

		// Always store the record for introspection
		providerState.records.push(record);
		providerState.lastUpdated = now;

		// Only update samples and EMA for successful requests
		if (success) {
			providerState.samples.push(totalMs);

			if (!providerState.initialised) {
				// Seed EMA with first successful observation
				providerState.ema = totalMs;
				providerState.initialised = true;
			} else {
				providerState.ema = calculateEma(providerState.ema, totalMs, this.alpha);
			}
		}

		logger.debug({
			msg: "latency recorded",
			provider,
			modelId,
			ttfbMs,
			totalMs,
			success,
			ema: Math.round(providerState.ema * 100) / 100,
			sampleCount: providerState.samples.length,
		});
	}

	/* ------------------------------------------------------------------ */
	/*  Read path                                                          */
	/* ------------------------------------------------------------------ */

	/**
	 * Get aggregated latency stats for a provider.
	 * Returns zero-valued stats when no data has been recorded yet.
	 */
	getStats(provider: ProviderName): LatencyStats {
		const providerState = this.state.get(provider);

		if (!providerState || providerState.samples.length === 0) {
			return {
				provider,
				sampleCount: 0,
				emaMs: 0,
				p50Ms: 0,
				p95Ms: 0,
				p99Ms: 0,
				lastUpdated: 0,
			};
		}

		const snapshot = providerState.samples.toArray();
		const pcts = calculatePercentiles(snapshot, [50, 95, 99]);

		return {
			provider,
			sampleCount: snapshot.length,
			emaMs: Math.round(providerState.ema * 100) / 100,
			p50Ms: pcts.get(50) as number,
			p95Ms: pcts.get(95) as number,
			p99Ms: pcts.get(99) as number,
			lastUpdated: providerState.lastUpdated,
		};
	}

	/** Get the current EMA for a provider (ms). Returns 0 if no data. */
	getEma(provider: ProviderName): number {
		const providerState = this.state.get(provider);
		if (!providerState || !providerState.initialised) return 0;
		return Math.round(providerState.ema * 100) / 100;
	}

	/** Get a specific percentile for a provider. Returns 0 if no data. */
	getPercentile(provider: ProviderName, p: number): number {
		const providerState = this.state.get(provider);
		if (!providerState || providerState.samples.length === 0) return 0;
		const pcts = calculatePercentiles(providerState.samples.toArray(), [p]);
		return pcts.get(p) as number;
	}

	/** Get the raw latency records for a provider (success + failure). */
	getRecords(provider: ProviderName): LatencyRecord[] {
		const providerState = this.state.get(provider);
		if (!providerState) return [];
		return providerState.records.toArray();
	}

	/** Reset all tracked data (useful for tests). */
	reset(): void {
		this.state.clear();
	}
}

/* ------------------------------------------------------------------ */
/*  Lazy singleton                                                     */
/* ------------------------------------------------------------------ */

let _instance: LatencyTracker | null = null;

/**
 * Lazily initialised singleton.
 *
 * The instance is created on first access (not at import time) so that
 * `loadRoutingConfig()` / env validation doesn't fire during test imports.
 */
export function getLatencyTracker(): LatencyTracker {
	if (!_instance) {
		// Dynamic import avoided — pull config only when actually needed
		const { loadRoutingConfig } = require("@/config/routing-config.ts") as {
			loadRoutingConfig: () => { latencyWindowSize: number; latencyEmaAlpha: number };
		};
		const config = loadRoutingConfig();
		_instance = new LatencyTracker({
			windowSize: config.latencyWindowSize,
			alpha: config.latencyEmaAlpha,
		});
	}
	return _instance;
}

/** Reset the singleton (for tests). */
export function resetLatencyTrackerSingleton(): void {
	_instance?.reset();
	_instance = null;
}

/**
 * @deprecated Use `getLatencyTracker()` for lazy initialization.
 * Kept for backward compatibility — resolves to the lazy singleton.
 */
export const latencyTracker: LatencyTracker = new Proxy({} as LatencyTracker, {
	get(_target, prop, _receiver) {
		const instance = getLatencyTracker();
		const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
		if (typeof value === "function") {
			return value.bind(instance);
		}
		return value;
	},
});
