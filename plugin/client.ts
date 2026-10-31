import { z } from "zod";
import type { parseConfig } from "./config";
import { type Fetch, object, pick, token, transport } from "./transport";

const jobFields = [
	"uuid",
	"active",
	"generated_job_id",
	"company_uuid",
	"status",
	"job_description",
	"work_done_description",
	"job_address",
	"billing_address",
	"purchase_order_number",
	"completion_date",
	"invoice_date",
	"invoice_sent",
	"invoice_sent_stamp",
	"total_invoice_amount",
	"payment_processed",
	"payment_received",
	"edit_date",
	"date",
];
const clientFields = [
	"uuid",
	"active",
	"name",
	"abn_number",
	"address",
	"billing_address",
	"billing_attention",
	"payment_terms",
	"edit_date",
];
const attachmentFields = [
	"uuid",
	"active",
	"related_object",
	"related_object_uuid",
	"attachment_name",
	"file_type",
	"attachment_source",
	"tags",
	"timestamp",
	"edit_date",
];
const rowSchema = object.refine(
	(row) => typeof row.uuid === "string",
	"Missing record UUID.",
);
export function createClient(
	config: ReturnType<typeof parseConfig>,
	credentials: unknown,
	fetcher?: Fetch,
) {
	const api = transport(
		"https://api.servicem8.com/api_1.0/",
		{ "X-API-Key": token(credentials, "servicem8") },
		fetcher,
	);
	async function account() {
		const result = z
			.object({
				account: z.object({ uuid: z.string(), name: z.string().optional() }),
				key: z.object({
					access_level: z.enum(["read_only", "full_access"]),
					auth_method: z.string().optional(),
				}),
			})
			.parse((await api.json("addonsdk/whoami.json")).data);
		if (result.account.uuid !== config.accountUuid)
			throw new Error("Credential belongs to a different ServiceM8 account.");
		return result;
	}
	async function record(path: string, uuid: string, fields: string[]) {
		const result = rowSchema.parse((await api.json(path)).data);
		if (result.uuid !== uuid)
			throw new Error("Provider returned an unexpected record.");
		return pick(result, fields);
	}
	async function page(
		path: string,
		fields: string[],
		cursor: string,
		filter: string,
	) {
		const result = await api.json(path, { cursor, $filter: filter });
		const rows = z.array(rowSchema).max(1000).parse(result.data);
		const nextCursor = z
			.uuid()
			.nullable()
			.parse(result.headers.get("x-next-cursor"));
		return { records: rows.map((row) => pick(row, fields)), nextCursor };
	}
	return {
		account,
		async jobs(status: string, cursor: string, modifiedSince?: string) {
			await account();
			const result = await page(
				"job.json",
				jobFields,
				cursor,
				`active eq 1 and status eq '${status}'${modifiedSince ? ` and edit_date gt '${modifiedSince}'` : ""}`,
			);
			return {
				...result,
				records: result.records.map((job) => ({
					...job,
					webUrl: `https://go.servicem8.com/OpenJob/${z.uuid().parse(job.uuid)}`,
				})),
			};
		},
		async job(uuid: string) {
			await account();
			return {
				...(await record(`job/${uuid}.json`, uuid, jobFields)),
				webUrl: `https://go.servicem8.com/OpenJob/${uuid}`,
			};
		},
		async clients(cursor: string) {
			await account();
			return page("company.json", clientFields, cursor, "active eq 1");
		},
		async client(uuid: string) {
			await account();
			return {
				...(await record(`company/${uuid}.json`, uuid, clientFields)),
				webUrl: `https://go.servicem8.com/OpenClient/${uuid}`,
			};
		},
		async attachments(jobId: string, cursor: string) {
			await account();
			await record(`job/${jobId}.json`, jobId, jobFields);
			const result = await page(
				"attachment.json",
				attachmentFields,
				cursor,
				`active eq 1 and related_object eq 'job' and related_object_uuid eq '${jobId}'`,
			);
			if (
				result.records.some(
					(row) =>
						row.related_object !== "job" || row.related_object_uuid !== jobId,
				)
			)
				throw new Error("Attachment is outside requested job.");
			return result;
		},
		async attachment(jobId: string, attachmentId: string) {
			await account();
			await record(`job/${jobId}.json`, jobId, jobFields);
			const result = await record(
				`dboattachment/${attachmentId}.json`,
				attachmentId,
				attachmentFields,
			);
			if (
				result.related_object !== "job" ||
				result.related_object_uuid !== jobId
			)
				throw new Error("Attachment is outside requested job.");
			return result;
		},
	};
}
