import type { PluginContext, SafeFunction } from "@orgsdk/plugins";
import { z } from "zod";
import { createClient } from "./client";
import { id, parseConfig } from "./config";
import type { Fetch } from "./transport";

const cursor = z.union([z.literal("-1"), id]).default("-1");
const pageResult =
	"{ records: Record<string, unknown>[]; nextCursor: string | null }";
export function createFunctions(
	store: PluginContext["stores"]["config"],
	fetcher?: Fetch,
): SafeFunction[] {
	function tool<T>(
		name: string,
		description: string,
		schema: z.ZodType<T>,
		parameters: NonNullable<SafeFunction["parameters"]>,
		result: string,
		run: (
			client: ReturnType<typeof createClient>,
			input: T,
		) => Promise<unknown>,
	): SafeFunction {
		return {
			name,
			description,
			parameters,
			returnType: `Promise<${result}>`,
			requiredCredentials: ["servicem8"],
			metadata: { readonly: true, category: "servicem8", tags: ["readonly"] },
			handler: async (credentials: unknown, input: unknown = {}) => {
				const parsed = schema.parse(input);
				const config = parseConfig(
					(await store.get("plugin:servicem8"))?.value ?? {},
				);
				return run(createClient(config, credentials, fetcher), parsed);
			},
		};
	}
	const cursorParameter = { name: "cursor", type: "string", optional: true };
	return [
		tool(
			"getAccount",
			"Verify API key and expected account; return account identity and key access level.",
			z.strictObject({}),
			[],
			"{ account: { uuid: string; name?: string }; key: { access_level: string; auth_method?: string } }",
			(client) => client.account(),
		),
		tool(
			"listJobs",
			"Read one ServiceM8 cursor page of active jobs; defaults to Completed for invoice evidence.",
			z.strictObject({
				status: z
					.enum(["Completed", "Quote", "Work Order", "Unsuccessful"])
					.default("Completed"),
				cursor,
				modifiedSince: z.iso.date().optional(),
			}),
			[
				{
					name: "status",
					type: '"Completed" | "Quote" | "Work Order" | "Unsuccessful"',
					optional: true,
				},
				cursorParameter,
				{ name: "modifiedSince", type: "string", optional: true },
			],
			pageResult,
			(client, input) =>
				client.jobs(input.status, input.cursor, input.modifiedSince),
		),
		tool(
			"getJob",
			"Read job scope, work done, completion and invoice fields. Web link requires ServiceM8 sign-in.",
			z.strictObject({ jobId: id }),
			[{ name: "jobId", type: "string" }],
			"Record<string, unknown>",
			(client, input) => client.job(input.jobId),
		),
		tool(
			"listClients",
			"Read one cursor page of active clients in the verified account.",
			z.strictObject({ cursor }),
			[cursorParameter],
			pageResult,
			(client, input) => client.clients(input.cursor),
		),
		tool(
			"getClient",
			"Read selected client and billing metadata in the verified account.",
			z.strictObject({ clientId: id }),
			[{ name: "clientId", type: "string" }],
			"Record<string, unknown>",
			(client, input) => client.client(input.clientId),
		),
		tool(
			"listJobAttachments",
			"Read one page of job-related attachment metadata, including quote or invoice source labels.",
			z.strictObject({ jobId: id, cursor }),
			[{ name: "jobId", type: "string" }, cursorParameter],
			pageResult,
			(client, input) => client.attachments(input.jobId, input.cursor),
		),
		tool(
			"getJobAttachment",
			"Read attachment metadata only after checking it belongs to the requested job.",
			z.strictObject({ jobId: id, attachmentId: id }),
			[
				{ name: "jobId", type: "string" },
				{ name: "attachmentId", type: "string" },
			],
			"Record<string, unknown>",
			(client, input) => client.attachment(input.jobId, input.attachmentId),
		),
	];
}
