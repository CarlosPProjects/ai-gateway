import type { MiddlewareHandler } from "hono";
import pino from "pino";

/** Pino logger configured for GCP Cloud Logging compatibility */
export const logger = pino({
	level: process.env.LOG_LEVEL || "info",
	messageKey: "message",
	formatters: {
		level(label) {
			return { severity: label.toUpperCase() };
		},
	},
	...(process.env.NODE_ENV === "development"
		? {
				transport: {
					target: "pino/file",
					options: { destination: 1 },
				},
			}
		: {}),
});

/** Request/response logging middleware */
export function requestLogger(): MiddlewareHandler {
	return async (c, next) => {
		const start = Date.now();
		const requestId = crypto.randomUUID();

		// Attach request ID to headers for tracing
		c.header("x-request-id", requestId);

		logger.info({
			type: "request",
			requestId,
			method: c.req.method,
			path: c.req.path,
			userAgent: c.req.header("user-agent"),
		});

		await next();

		const duration = Date.now() - start;

		// Build response log with optional cost fields
		const responseLog: Record<string, unknown> = {
			type: "response",
			requestId,
			method: c.req.method,
			path: c.req.path,
			status: c.res.status,
			duration,
		};

		// Include cost fields from response headers if set by the chat route
		const costUsd = c.res.headers.get("x-cost-usd");
		const inputTokens = c.res.headers.get("x-input-tokens");
		const outputTokens = c.res.headers.get("x-output-tokens");

		if (costUsd) responseLog.cost_usd = Number.parseFloat(costUsd);
		if (inputTokens) responseLog.input_tokens = Number.parseInt(inputTokens, 10);
		if (outputTokens) responseLog.output_tokens = Number.parseInt(outputTokens, 10);

		logger.info(responseLog);
	};
}
