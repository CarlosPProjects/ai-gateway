import type { ProviderName } from "@/config/providers.ts";
import type { ModelPricing } from "@/types/metrics.ts";

/**
 * Model pricing table — approximate USD costs per 1K tokens.
 * Updated periodically; does not need to be exact.
 */
const PRICING_TABLE: Record<string, ModelPricing> = {
	// OpenAI
	"gpt-4o": {
		modelId: "gpt-4o",
		provider: "openai" as ProviderName,
		inputPer1k: 0.0025,
		outputPer1k: 0.01,
	},
	"gpt-4o-mini": {
		modelId: "gpt-4o-mini",
		provider: "openai" as ProviderName,
		inputPer1k: 0.00015,
		outputPer1k: 0.0006,
	},
	"gpt-3.5-turbo": {
		modelId: "gpt-3.5-turbo",
		provider: "openai" as ProviderName,
		inputPer1k: 0.0005,
		outputPer1k: 0.0015,
	},

	// Anthropic
	"claude-3.5-sonnet": {
		modelId: "claude-3.5-sonnet",
		provider: "anthropic" as ProviderName,
		inputPer1k: 0.003,
		outputPer1k: 0.015,
	},
	"claude-sonnet-4-20250514": {
		modelId: "claude-sonnet-4-20250514",
		provider: "anthropic" as ProviderName,
		inputPer1k: 0.003,
		outputPer1k: 0.015,
	},
	"claude-3-haiku": {
		modelId: "claude-3-haiku",
		provider: "anthropic" as ProviderName,
		inputPer1k: 0.00025,
		outputPer1k: 0.00125,
	},
	"claude-haiku-3-5": {
		modelId: "claude-haiku-3-5",
		provider: "anthropic" as ProviderName,
		inputPer1k: 0.0008,
		outputPer1k: 0.004,
	},

	// Google
	"gemini-1.5-pro": {
		modelId: "gemini-1.5-pro",
		provider: "google" as ProviderName,
		inputPer1k: 0.00125,
		outputPer1k: 0.005,
	},
	"gemini-1.5-flash": {
		modelId: "gemini-1.5-flash",
		provider: "google" as ProviderName,
		inputPer1k: 0.000075,
		outputPer1k: 0.0003,
	},
	"gemini-2.0-flash": {
		modelId: "gemini-2.0-flash",
		provider: "google" as ProviderName,
		inputPer1k: 0.0001,
		outputPer1k: 0.0004,
	},
	"gemini-2.0-pro": {
		modelId: "gemini-2.0-pro",
		provider: "google" as ProviderName,
		inputPer1k: 0.00125,
		outputPer1k: 0.005,
	},
};

/** Default fallback pricing when model is not in the table */
const DEFAULT_PRICING: ModelPricing = {
	modelId: "unknown",
	provider: "openai" as ProviderName,
	inputPer1k: 0.002,
	outputPer1k: 0.006,
};

/**
 * Look up pricing for a model. Returns exact match if available,
 * otherwise returns a conservative default fallback.
 */
export function getModelPricing(modelId: string): ModelPricing {
	const pricing = PRICING_TABLE[modelId];
	if (pricing) {
		return pricing;
	}

	// Return fallback with the actual modelId for logging purposes
	return { ...DEFAULT_PRICING, modelId };
}
