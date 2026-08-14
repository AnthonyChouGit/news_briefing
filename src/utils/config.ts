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
    timeout: z.coerce.number().int().positive().default(300000),
    max_retries: z.coerce.number().int().positive().default(3)
});
export type AICientConfig = z.infer<typeof AICientConfigSchema>;

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

export const loadConfig = (config_path: string = ".env"): Config => {
    const result = dotenv.config({ path: config_path });
    if (result.error || !result.parsed)
        throw result.error;
    const config: Config = ConfigSchema.parse(result.parsed);
    return config;
}