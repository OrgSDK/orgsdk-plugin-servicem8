import { expect, test } from "bun:test";
import type { PluginContext } from "@orgsdk/plugins";
import createPlugin from "../plugin";
import { createFunctions } from "../plugin/functions";
import type { Fetch } from "../plugin/transport";

const accountUuid = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";
const attachmentId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const identity = {
	account: { uuid: accountUuid, name: "Service business", email: "private" },
	key: { access_level: "read_only", auth_method: "api_key" },
};
const store = {
	get: async () => ({ value: { accountUuid } }),
} as unknown as PluginContext["stores"]["config"];
const credentials = { servicem8: { secret_apiKey: "sentinel" } };
function tool(name: string, fetcher: Fetch) {
	const fn = createFunctions(store, fetcher).find((fn) => fn.name === name);
	if (!fn) throw new Error("Missing test tool");
	return fn;
}
test("factory exposes only credential-backed reads and strict account config", async () => {
	const module = await createPlugin({
		stores: { config: store },
	} as PluginContext);
	expect(module).not.toHaveProperty("authProvider");
	expect(module.safeFunctions).toHaveLength(7);
	for (const fn of module.safeFunctions ?? [])
		expect(fn.requiredCredentials).toEqual(["servicem8"]);
	expect(() => module.config?.schema.parse({})).toThrow();
});
test("verifies account before every business resource and fails closed on wrong key", async () => {
	const seen: URL[] = [];
	const fn = tool("getJob", async (url) => {
		seen.push(url);
		return Response.json({ ...identity, account: { uuid: otherId } });
	});
	await expect(fn.handler(credentials, { jobId })).rejects.toThrow(
		"different ServiceM8 account",
	);
	expect(seen).toHaveLength(1);
	expect(seen[0].pathname).toEndWith("/addonsdk/whoami.json");
});
test("identity excludes account email and leaves key access visible", async () => {
	const result = await tool("getAccount", async () =>
		Response.json(identity),
	).handler(credentials, {});
	expect(result).toEqual({
		account: { uuid: accountUuid, name: "Service business" },
		key: identity.key,
	});
});
test("completed job pagination returns provider cursor and invoice evidence", async () => {
	const seen: URL[] = [];
	const fn = tool("listJobs", async (url, init) => {
		seen.push(url);
		expect(init.headers).toEqual({ "X-API-Key": "sentinel" });
		return url.pathname.endsWith("whoami.json")
			? Response.json(identity)
			: Response.json(
					[
						{
							uuid: jobId,
							status: "Completed",
							work_done_description: "Repaired",
							invoice_sent: 0,
							completion_date: "2026-10-29 14:00:00",
							total_invoice_amount: "250.00",
						},
					],
					{ headers: { "x-next-cursor": otherId } },
				);
	});
	const result = await fn.handler(credentials, { modifiedSince: "2026-10-01" });
	expect(result).toMatchObject({
		nextCursor: otherId,
		records: [
			{
				status: "Completed",
				work_done_description: "Repaired",
				invoice_sent: 0,
				webUrl: `https://go.servicem8.com/OpenJob/${jobId}`,
			},
		],
	});
	expect(seen[1].searchParams.get("cursor")).toBe("-1");
	expect(seen[1].searchParams.get("$filter")).toBe(
		"active eq 1 and status eq 'Completed' and edit_date gt '2026-10-01'",
	);
});
test("rejects attachment from a different job and never exposes download URLs", async () => {
	const fn = tool("getJobAttachment", async (url) => {
		if (url.pathname.endsWith("whoami.json")) return Response.json(identity);
		if (url.pathname.includes("/job/")) return Response.json({ uuid: jobId });
		return Response.json({
			uuid: attachmentId,
			related_object: "job",
			related_object_uuid: otherId,
			download_url: "https://private.example/signed",
		});
	});
	await expect(
		fn.handler(credentials, { jobId, attachmentId }),
	).rejects.toThrow("outside requested job");
	const good = tool("getJobAttachment", async (url) =>
		Response.json(
			url.pathname.endsWith("whoami.json")
				? identity
				: url.pathname.includes("/job/")
					? { uuid: jobId }
					: {
							uuid: attachmentId,
							related_object: "job",
							related_object_uuid: jobId,
							attachment_source: "INVOICE",
							download_url: "https://private.example/signed",
						},
		),
	);
	const result = await good.handler(credentials, { jobId, attachmentId });
	expect(result).toMatchObject({ attachment_source: "INVOICE" });
	expect(result).not.toHaveProperty("download_url");
});
test("rejects filter injection, arbitrary paths and fake approval flags before network", async () => {
	let requests = 0;
	const fetcher: Fetch = async () => {
		requests++;
		return Response.json({});
	};
	await expect(
		tool("getJob", fetcher).handler(credentials, {
			jobId: "https://evil.example",
		}),
	).rejects.toThrow();
	await expect(
		tool("listJobs", fetcher).handler(credentials, {
			status: "Completed' or active eq 0",
		}),
	).rejects.toThrow();
	await expect(
		tool("getJob", fetcher).handler(credentials, { jobId, approved: true }),
	).rejects.toThrow();
	expect(requests).toBe(0);
});
