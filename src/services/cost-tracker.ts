/**
 * Cost tracking service — per-request cost calculation and aggregation.
 * Singleton, in-memory store — same pattern as error-tracker.ts.
 *
 * Records token usage and USD cost for every LLM request,
 * broken down by provider and model. Exposes a summary for /metrics.
 */

import { getModelPricing } from "@/config/pricing.ts";
import type { ProviderName } from "@/config/providers.ts";
import { logger } from "@/middleware/logging.ts";
import type { CostRecord } from "@/types/metrics.ts";

// ── Types ────────────────────────────────────────────────

interface ProviderCostStats {
	requests: number;
	totalCost: number;
	inputTokens: number;
	outputTokens: number;
}

export interface CostSummary {
	totalCostUsd: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	byProvider: Record<ProviderName, ProviderCostStats>;
	byModel: Record<string, { requests: number; totalCost: number }>;
	recentRequests: CostRecord[];
}

// ── Constants ────────────────────────────────────────────

/** Rolling window of recent requests kept in memory */
const MAX_RECENT_REQUESTS = 50;

/** Cost alert threshold — warn when cumulative cost exceeds this (USD) */
const COST_ALERT_THRESHOLD_USD = 10;

// ── State ────────────────────────────────────────────────

const recentRequests: CostRecord[] = [];
let totalCostUsd = 0;
let totalInputTokens = 0;
let totalOutputTokens = 0;
let alertFired = false;

const byProvider: Record<ProviderName, ProviderCostStats> = {
	openai: { requests: 0, totalCost: 0, inputTokens: 0, outputTokens: 0 },
	anthropic: { requests: 0, totalCost: 0, inputTokens: 0, outputTokens: 0 },
	google: { requests: 0, totalCost: 0, inputTokens: 0, outputTokens: 0 },
};

const byModel: Record<string, { requests: number; totalCost: number }> = {};

// ── Helpers ──────────────────────────────────────────────

/**
 * Check if cumulative cost exceeds alert threshold and log a warning once.
 */
function checkCostAlert(): void {
	if (!alertFired && totalCostUsd >= COST_ALERT_THRESHOLD_USD) {
		alertFired = true;
		logger.warn(
			{
				alert: "cost_threshold_exceeded",
				totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
				thresholdUsd: COST_ALERT_THRESHOLD_USD,
			},
			`Cumulative cost exceeded $${COST_ALERT_THRESHOLD_USD}`,
		);
	}
}

// ── Public API ───────────────────────────────────────────

/**
 * Calculate cost and record it for a completed request.
 * Returns the computed CostRecord for use in logging / response headers.
 */
export function recordCost(
	provider: ProviderName,
	modelId: string,
	inputTokens: number,
	outputTokens: number,
): CostRecord {
	const pricing = getModelPricing(modelId);

	const inputCost = (inputTokens / 1000) * pricing.inputPer1k;
	const outputCost = (outputTokens / 1000) * pricing.outputPer1k;
	const costUsd = inputCost + outputCost;

	const record: CostRecord = {
		provider,
		modelId,
		inputTokens,
		outputTokens,
		costUsd,
		timestamp: Date.now(),
	};

	// Update global totals
	totalCostUsd += costUsd;
	totalInputTokens += inputTokens;
	totalOutputTokens += outputTokens;

	// Update per-provider stats
	const providerStats = byProvider[provider];
	providerStats.requests++;
	providerStats.totalCost += costUsd;
	providerStats.inputTokens += inputTokens;
	providerStats.outputTokens += outputTokens;

	// Update per-model stats
	if (!byModel[modelId]) {
		byModel[modelId] = { requests: 0, totalCost: 0 };
	}
	byModel[modelId].requests++;
	byModel[modelId].totalCost += costUsd;

	// Maintain rolling window of recent requests
	recentRequests.push(record);
	if (recentRequests.length > MAX_RECENT_REQUESTS) {
		recentRequests.shift();
	}

	// Check alert threshold
	checkCostAlert();

	return record;
}

/** Get a snapshot of cost tracking data */
export function getCostSummary(): CostSummary {
	return {
		totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
		totalInputTokens,
		totalOutputTokens,
		byProvider: {
			openai: { ...byProvider.openai },
			anthropic: { ...byProvider.anthropic },
			google: { ...byProvider.google },
		},
		byModel: { ...byModel },
		recentRequests: [...recentRequests],
	};
}

/** Get the current total cost (avoids importing the full summary) */
export function getTotalCost(): number {
	return totalCostUsd;
}

/** Singleton accessor — exported as a namespace object for convenience */
export const costTracker = {
	recordCost,
	getCostSummary,
	getTotalCost,
} as const;
