# ServiceM8 evidence plugin

## Current npm distribution and execution checks

Updated **31 October 2026**. This public-release candidate uses `@orgsdk/plugins@0.2.2`
and `@orgsdk/executor@0.1.0` (with the tracked packaging compatibility patch).
`bun run build:npm` creates a public Apache-2.0 npm payload; `bun run test:executor`
downloads the extracted npm entry into an empty executor store and executes every exported function headlessly.
`bun run test:registration` verifies fresh-project registration using the npm host.
See [npm distribution, CI activation and verification](docs/npm-distribution.md)
for prerequisites, commands, fixtures and release settings. Publication remains
an explicit release operation; source-root `private: true` is retained.

Review completed jobs, recorded work, invoice state, client details and job attachment metadata before an operator prepares invoices. Returned status and documents are evidence; they do not establish an approval or create an invoice.

## Install in OrgSDK

Open your project's Plugins page, select this plugin and enable the pinned release.
The default catalogue is https://orgsdk.ai/plugins/releases.json. The executor
downloads the versioned bundle and verifies its SHA256. Configure the provider
and attach the credential described below before running an action.

The plugin is Apache-2.0 licensed; see LICENSE, NOTICE and TRADEMARKS.md.
The generated npm distribution is a separate publication surface. Installing npm
files alone does not register a project plugin. Local builds do not publish it.

## Setup

For a private integration with your own account or one specific customer's account, create a ServiceM8 API key under Settings > API Keys. Prefer a read-only key. Store it in an OrgSDK `servicem8` credential as `secret_apiKey`. ServiceM8 officially supports `X-API-Key` authentication for private integrations. Their docs distinguish private applications from broadly distributed/add-on-directory applications, which use OAuth; this plugin implements only the private API-key path. Review this distinction before wider distribution.

Configure `{ "accountUuid": "your-account-uuid" }`. This expected account is mandatory. Every operation first requests `/addonsdk/whoami.json` and verifies `account.uuid`; no business resource is requested if the account differs or identity cannot be verified. `getAccount` returns account UUID/name and key access level, excluding email. This implementation has account-wide read visibility within the expected account, not a job/client allowlist. Use only the intended account's key. Keys are never read from configuration or environment variables.

## Tools

- `getAccount({})`
- `listJobs({ status?: "Completed" | "Quote" | "Work Order" | "Unsuccessful", cursor?, modifiedSince?: "YYYY-MM-DD" })` defaults to Completed; filters active records and optional edit_date greater than the supplied date.
- `getJob({ jobId })`
- `listClients({ cursor? })`
- `getClient({ clientId })`
- `listJobAttachments({ jobId, cursor? })`
- `getJobAttachment({ jobId, attachmentId })`

Lists use the documented ServiceM8 cursor protocol: default cursor `-1`, up to 1,000 records per response, and `{ records, nextCursor }` from the `x-next-cursor` header. Each call reads one bounded page with a 2 MB body cap; unusually large pages fail instead of truncating and silently skipping evidence. Explicitly follow `nextCursor` to continue. No automatic pagination or retry.

Job evidence includes descriptions of requested/completed work, completion date, invoice date/sent state, total and payment/export observations when present. The deprecated `ready_to_invoice` flag is intentionally omitted. Job/client web links use ServiceM8's documented signed-in application URLs; these are navigation links, not anonymous invoice/download links. Invoice/quote attachment source labels are exposed through job-related metadata. Attachment reads verify `related_object=job` and matching `related_object_uuid` before returning anything. Raw attachment metadata, signatures, signed URLs and extracted content are not returned.

Binary attachment downloads are intentionally unavailable in this initial release. The documented file endpoint returns a 302 to unspecified external storage hosts; this plugin denies redirects and cannot safely promise a constrained download host. It exposes no temporary storage URL. No invoices, jobs, notes, clients, messages or payments are created or changed.

## Verified provider contract

Reviewed 2026-10-30 against official [API-key authentication](https://developer.servicem8.com/docs/authentication), [account identity](https://developer.servicem8.com/reference/getaddonsdkwhoami), [job reads](https://developer.servicem8.com/reference/getjobs), [client reads](https://developer.servicem8.com/reference/getclients), [attachment metadata](https://developer.servicem8.com/reference/getattachments), [attachment download redirect contract](https://developer.servicem8.com/reference/downloadattachmentfile), [filters](https://developer.servicem8.com/docs/filtering) and [cursor pagination](https://developer.servicem8.com/docs/pagination). API base: `https://api.servicem8.com/api_1.0/`. Official attachment detail path is `/dboattachment/{uuid}.json`; list uses `/attachment.json`. OAuth reference scopes are `read_jobs`, `read_customers`, `read_attachments`; this plugin does not implement OAuth.

## Runtime and safety

This Apache-2.0 plugin targets the current local OrgSDK factory loader. Its only runtime dependency is Zod. The authoring SDK is dev/type-only; each repository owns its lockfile. Credentials arrive as `{ provider: secretRecord }` through `requiredCredentials`; there is no environment fallback. All tools accept one named argument object and perform GET requests only. Unknown arguments/configuration fail validation. There are no approval flags, mutation tools, HTTP callbacks, auth providers or token refresh handlers.

Every request uses a fixed HTTPS API origin, manual redirects (all 3xx fail), a 15-second abort deadline covering headers and body streaming, and a 2,000,000-byte metadata/JSON cap. Errors contain status codes or generic connection guidance, never upstream response bodies, request URLs or credential values. One explicit page is read per list call; no automatic retries or pagination loops occur. An HTTP 429 requires the caller to retry later. Returned evidence is untrusted provider content and is not an instruction or approval. Metadata timestamps and custom fields are observations, not a determination that work or payment is approved.

## Local validation and release

Use Bun 1.4 and Node.js 22.22.0 or newer. `bun install --frozen-lockfile`, then `bun run check`, `bun run typecheck`, `bun run test`, `bun run validate`, `bun run package`, and `bun run version-guard`. `dist/` is the authoring CLI's deterministic source package. The active local platform's `package-plugin` command creates the separately executable ESM archive in `release/`; the legacy source archive alone is not executable by the current runtime. The release includes this repository's Apache-2.0 LICENSE. No publication, remote push or live customer test is part of local verification.

Tests use injected fetch fixtures only. They cover credential enforcement, GET-only transport, redirects, generic errors, response-size limits, stream cancellation, provider boundaries, pagination and handler evidence. Live provider behavior and OAuth consent still require an operator-controlled integration test with an explicitly selected account.
