import { env } from "@/config/env.ts";

/** Supported LLM provider identifiers */
export type ProviderName = "openai" | "anthropic" | "google";

/** All known provider names as a readonly array (useful for iteration) */
export const PROVIDER_NAMES: readonly ProviderName[] = ["openai", "anthropic", "google"] as const;

/** Configuration state for a single provider */
export interface ProviderConfig {
	name: ProviderName;
	enabled: boolean;
}

/** Check which providers have API keys configured */
export function getEnabledProviders(): ProviderConfig[] {
	return [
		{ name: "openai", enabled: !!env.OPENAI_API_KEY },
		{ name: "anthropic", enabled: !!env.ANTHROPIC_API_KEY },
		{ name: "google", enabled: !!env.GOOGLE_API_KEY },
	];
}
