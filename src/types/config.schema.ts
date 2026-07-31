import * as z from "zod";

export const DbConfigSchema = z.object({
    database_host: z.string().nonempty().default("localhost"),
    database_port: z.coerce.number().int().positive().default(5432),
    database_user: z.string().nonempty(),
    database_password: z.string(),
    database_name: z.string().nonempty()
});

export type DbConfig = z.infer<typeof DbConfigSchema>;

export const AICientConfigSchema = z.object({
    api_key: z.string().nonempty(),
    base_url: z.string().nonempty(),
    model: z.string().nonempty(),
    instruction: z.string().nonempty().optional(),
    timeout: z.number().int().positive().default(300000),
    max_retries: z.number().int().positive().default(3)
});

export type AICientConfig = z.infer<typeof AICientConfigSchema>;

export const FetchOptionsSchema = z.object({
    timeout: z.number().int().positive().optional(),
    maxDecodeItems: z.number().int().positive().optional(),
    userAgent: z.string().nonempty().optional()
}).default({});

export type FetchOptions = z.infer<typeof FetchOptionsSchema>;

export const ReadOptionsSchema = z.object({
    timeout: z.number().int().positive().optional(),
    userAgent: z.string().nonempty().optional(),
    maxBodyChars: z.number().int().positive().optional(),
    concurrency: z.number().int().positive().optional()
}).default({});

export type ReadOptions = z.infer<typeof ReadOptionsSchema>;