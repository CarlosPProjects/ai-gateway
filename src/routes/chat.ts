import { zValidator } from "@hono/zod-validator";
import { generateText, streamText } from "ai";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { logger } from "@/middleware/logging.ts";
import { recordCost } from "@/services/cost-tracker.ts";
import { routeModel } from "@/services/router/index.ts";
import type { ChatCompletionChunk, ChatCompletionResponse } from "@/types/index.ts";
import { ChatCompletionRequestSchema } from "@/types/index.ts";

const chat = new Hono();

function generateId(): string {
	return `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

chat.post(
	"/v1/chat/completions",
	zValidator("json", ChatCompletionRequestSchema, (result, c) => {
		if (!result.success) {
			return c.json(
				{
					error: {
						message: "Invalid request body",
						type: "invalid_request_error",
						code: "validation_error",
						details: result.error.issues,
					},
				},
				400,
			);
		}
	}),
	async (c) => {
		const body = c.req.valid("json");
		const { model, messages, stream, temperature, max_tokens, top_p, stop } = body;

		// Route to the correct provider
		const route = routeModel(model);

		// Convert stop to array format if needed
		const stopSequences = stop ? (Array.isArray(stop) ? stop : [stop]) : undefined;

		if (stream) {
			// --- Streaming Response (SSE) ---
			const completionId = generateId();
			const created = Math.floor(Date.now() / 1000);

			return streamSSE(c, async (sseStream) => {
				const result = streamText({
					model: route.model,
					messages: messages.map((m) => ({
						role: m.role,
						content: m.content,
					})),
					temperature,
					maxOutputTokens: max_tokens ?? undefined,
					topP: top_p ?? undefined,
					stopSequences,
					onError({ error }) {
						console.error("Stream error:", error);
					},
				});

				// Stream text deltas as OpenAI-compatible SSE chunks
				for await (const textPart of result.textStream) {
					const chunk: ChatCompletionChunk = {
						id: completionId,
						object: "chat.completion.chunk",
						created,
						model: route.modelId,
						choices: [
							{
								index: 0,
								delta: { content: textPart },
								finish_reason: null,
							},
						],
					};

					await sseStream.writeSSE({
						data: JSON.stringify(chunk),
					});
				}

				// Send final chunk with finish_reason
				const finalChunk: ChatCompletionChunk = {
					id: completionId,
					object: "chat.completion.chunk",
					created,
					model: route.modelId,
					choices: [
						{
							index: 0,
							delta: {},
							finish_reason: "stop",
						},
					],
				};

				await sseStream.writeSSE({
					data: JSON.stringify(finalChunk),
				});

				// Send [DONE] marker per OpenAI spec
				await sseStream.writeSSE({
					data: "[DONE]",
				});

				// Record cost after stream completes (Vercel AI SDK resolves usage after stream)
				try {
					const usage = await result.usage;
					if (usage) {
						const inputTokens = usage.inputTokens ?? 0;
						const outputTokens = usage.outputTokens ?? 0;
						const costRecord = recordCost(route.provider, route.modelId, inputTokens, outputTokens);
						logger.info({
							type: "cost",
							provider: route.provider,
							model: route.modelId,
							streaming: true,
							input_tokens: inputTokens,
							output_tokens: outputTokens,
							cost_usd: costRecord.costUsd,
						});
					}
				} catch {
					// Usage may not be available for all providers — non-fatal
				}
			});
		}

		// --- Non-streaming Response ---
		const result = await generateText({
			model: route.model,
			messages: messages.map((m) => ({
				role: m.role,
				content: m.content,
			})),
			temperature,
			maxOutputTokens: max_tokens ?? undefined,
			topP: top_p ?? undefined,
			stopSequences,
		});

		const inputTokens = result.usage?.inputTokens ?? 0;
		const outputTokens = result.usage?.outputTokens ?? 0;

		// Record cost tracking
		const costRecord = recordCost(route.provider, route.modelId, inputTokens, outputTokens);
		logger.info({
			type: "cost",
			provider: route.provider,
			model: route.modelId,
			streaming: false,
			input_tokens: inputTokens,
			output_tokens: outputTokens,
			cost_usd: costRecord.costUsd,
		});

		const response: ChatCompletionResponse = {
			id: generateId(),
			object: "chat.completion",
			created: Math.floor(Date.now() / 1000),
			model: route.modelId,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: result.text,
					},
					finish_reason: result.finishReason ?? "stop",
				},
			],
			usage: {
				prompt_tokens: inputTokens,
				completion_tokens: outputTokens,
				total_tokens: result.usage?.totalTokens ?? 0,
			},
		};

		return c.json(response);
	},
);

export { chat };
