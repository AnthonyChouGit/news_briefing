import * as z from "zod";
import dotenv from "dotenv";
import { NewsCategorySchema } from "../types/news_category.enum.js";
import { FetchOptionsSchema } from "../operators/fetchNews.operator.js";
import { ReadOptionsSchema } from "../operators/readNews.operator.js";
import { FormatNewsOptionsSchema } from "../operators/formatNews.operator.js";
import { HistoryNewsOptionsSchema } from "../operators/historyNews.operator.js";
import { SendNewsOptionsSchema } from "../operators/sendNews.operator.js";
import { SummarizeNewsOptionsSchema } from "../operators/summarizeNews.operator.js";
import { TruncateNewsOptionsSchema } from "../operators/truncateNews.operator.js";
import { FilterRecencyOptionsSchema } from "../operators/filterRecency.operator.js";

export const DbConfigSchema = z.object({
    database_host: z.string().nonempty().default("localhost"),
    database_port: z.coerce.number().int().positive().default(5432),
    database_user: z.string().nonempty(),
    database_password: z.string(),
    database_name: z.string().nonempty()
});
export type DbConfig = z.infer<typeof DbConfigSchema>;

export const AIClientConfigSchema = z.object({
    ai_api_key: z.string().nonempty(),
    ai_base_url: z.string().nonempty(),
    ai_model: z.string().nonempty(),
    ai_timeout: z.coerce.number().int().positive().default(300000),
    ai_max_retries: z.coerce.number().int().positive().default(3),
    ai_reasoning_effort: z.enum(["low", "medium", "high"]).default("medium")
});
export type AIClientConfig = z.infer<typeof AIClientConfigSchema>;
export const AICientConfigSchema = AIClientConfigSchema;
export type AICientConfig = AIClientConfig;

export const TelegramConfigSchema = z.object({
    telegram_token: z.string().nonempty()
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

export const ErrorHandlerConfigSchema = z.object({
    error_channels: z.string().default("")
        .transform((val) => val?.split(",").map((s) => s.trim()))
});
export type ErrorHandlerConfig = z.infer<typeof ErrorHandlerConfigSchema>;

export const CronConfigSchema = z.object({
    cron_expr: z.string().optional(),
    time_zone: z.string().optional()
});
export type CronConfig = z.infer<typeof CronConfigSchema>;

export const DagConfigSchema = z.object({
    dag_timeout: z.coerce.number().positive().optional()
});
export type DagConfig = z.infer<typeof DagConfigSchema>;

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
    .and(InputSchema)
    .and(ErrorHandlerConfigSchema)
    .and(CronConfigSchema)
    .and(DagConfigSchema)
    .and(FilterRecencyOptionsSchema);

export type Config = z.infer<typeof ConfigSchema>;

export const loadConfig = (config_path: string = "./.env"): Config => {
    const { parsed } = dotenv.config({ path: config_path });
    return ConfigSchema.parse(parsed);
};