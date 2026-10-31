import { z } from "zod";
export const id = z.uuid();
export const configSchema = z.strictObject({
	accountUuid: id.describe(
		"Expected ServiceM8 account UUID; verified through whoami before every operation.",
	),
});
export const parseConfig = (input: unknown) => configSchema.parse(input);
