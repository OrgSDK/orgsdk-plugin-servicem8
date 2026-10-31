import assert from "node:assert/strict";

const accountUuid = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";
const clientId = "33333333-3333-4333-8333-333333333333";
const attachmentId = "44444444-4444-4444-8444-444444444444";
const job = { uuid: jobId, generated_job_id: "81", status: "Completed" };
const client = { uuid: clientId, name: "Synthetic client" };
const attachment = {
	uuid: attachmentId,
	related_object: "job",
	related_object_uuid: jobId,
	attachment_name: "Docket",
};
export default async function createFixture() {
	return {
		configuration: { accountUuid: "11111111-1111-4111-8111-111111111111" },
		provider: "servicem8",
		secret: { secret_apiKey: "synthetic-servicem8" },
		async fetch(request) {
			const url = new URL(request.url);
			assert.equal(url.origin, "https://api.servicem8.com");
			assert.equal(request.method, "GET");
			assert.equal(request.headers.get("x-api-key"), "synthetic-servicem8");
			const responses = {
				"/api_1.0/addonsdk/whoami.json": {
					account: { uuid: accountUuid, name: "Synthetic business" },
					key: { access_level: "read_only" },
				},
				"/api_1.0/job.json": [job],
				[`/api_1.0/job/${jobId}.json`]: job,
				"/api_1.0/company.json": [client],
				[`/api_1.0/company/${clientId}.json`]: client,
				"/api_1.0/attachment.json": [attachment],
				[`/api_1.0/dboattachment/${attachmentId}.json`]: attachment,
			};
			assert(Object.hasOwn(responses, url.pathname), url.pathname);
			return Response.json(responses[url.pathname]);
		},
		async run(call) {
			assert.equal((await call("getAccount")).account.uuid, accountUuid);
			assert.equal((await call("listJobs")).records[0].uuid, jobId);
			assert.equal((await call("getJob", { jobId })).uuid, jobId);
			assert.equal((await call("listClients")).records[0].uuid, clientId);
			assert.equal((await call("getClient", { clientId })).uuid, clientId);
			assert.equal(
				(await call("listJobAttachments", { jobId })).records[0].uuid,
				attachmentId,
			);
			assert.equal(
				(await call("getJobAttachment", { jobId, attachmentId })).uuid,
				attachmentId,
			);
		},
	};
}
