import * as z from "zod";
import { LanguageSchema } from "./language.enum.js";
import { TelegramParseModeSchema } from "../utils/telegram.js";
import { NewsCategorySchema } from "./brief_news.entity.js";

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
    timeout: z.coerce.number().int().nonnegative().optional(),
    maxDecodeItems: z.coerce.number().int().nonnegative().optional(),
    userAgent: z.string().nonempty().optional()
}).default({});
export type FetchOptions = z.infer<typeof FetchOptionsSchema>;

export const ReadOptionsSchema = z.object({
    timeout: z.coerce.number().int().nonnegative().optional(),
    userAgent: z.string().nonempty().optional(),
    maxBodyChars: z.coerce.number().int().nonnegative().optional(),
    concurrency: z.coerce.number().int().positive().optional()
}).default({});
export type ReadOptions = z.infer<typeof ReadOptionsSchema>;

export const FormatNewsOptionsSchema = z.object({
    language: LanguageSchema
});
export type FormatNewsOptions = z.infer<typeof FormatNewsOptionsSchema>;

export const HistoryNewsOptionsSchema = z.object({
    time_window_days: z.number().positive().default(3)
});
export type HistoryNewsOptions = z.infer<typeof HistoryNewsOptionsSchema>;

export const SendNewsOptionsSchema = z.object({
    parse_mode: TelegramParseModeSchema
});
export type SendNewsOptions = z.infer<typeof SendNewsOptionsSchema>;

export const SummarizeNewsOptionsSchema = z.object({
    language: LanguageSchema
});
export type SummarizeNewsOptions = z.infer<typeof SummarizeNewsOptionsSchema>;

export const TruncateNewsOptionsSchema = z.object({
    max_items_per_category: z.number().int().positive().optional().default(5)
});
export type TruncateNewsOptions = z.infer<typeof TruncateNewsOptionsSchema>;

export const TelegramConfigSchema = z.object({
    token: z.string().nonempty()
});
export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;

export const InputSchema = z.object({
    categories: z.string().nonempty()
        .transform((val) => val.split(",").map((s) => s.trim()))
        .pipe(z.array(NewsCategorySchema).nonempty()),
    channels: z.string().nonempty()
        .transform((val) => val.split(",").map((s) => s.trim()))
});
export type Input = z.infer<typeof InputSchema>;

export const ConfigSchema = DbConfigSchema
    .and(AICientConfigSchema)
    .and(FetchOptionsSchema)
    .and(ReadOptionsSchema)
    .and(FormatNewsOptionsSchema)
    .and(HistoryNewsOptionsSchema)
    .and(SendNewsOptionsSchema)
    .and(SummarizeNewsOptionsSchema)
    .and(TruncateNewsOptionsSchema)
    .and(TelegramConfigSchema)
    .and(InputSchema);

export type Config = z.infer<typeof ConfigSchema>;
