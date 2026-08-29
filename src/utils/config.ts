import * as z from "zod";
import dotenv from "dotenv";
import { NewsCategorySchema } from "../types/news_category.enum.js";
import { FetchOptionsSchema } from "../operators/fetchNews.operator.js";
import { ReadOptionsSchema } from "../operators/readNews.operator.js";
import { FormatNewsOptionsSchema } from "../operators/formatNews.operator.js";
import { HistoryNewsOptionsSchema } from "../operators/historyNews.operator.js";
import { SendNewsOptionsSchema } from "../operators/sendNews.operator.js";
import { SummarizeNewsOptionsSchema } from "../operators/summarizeNews.operator.js";
import { FilterRecencyOptionsSchema } from "../operators/filterRecency.operator.js";
import { AIClientConfigSchema } from "./ai.js";
const BooleanConfigSchema = z.enum(['true', 'false', 'True', 'False']).default('false').transform((val) => val === 'true' || val === 'True');

const DbConfigSchema = z.object({
    database_host: z.string().nonempty().default("localhost"),
    database_port: z.coerce.number().int().positive().default(5432),
    database_user: z.string().nonempty(),
    database_password: z.string(),
    database_name: z.string().nonempty()
});

const TruncateNewsOptionsSchema = z.object({
    pre_read_truncate_number: z.coerce.number().int().positive(),
    post_summarize_truncate_number: z.coerce.number().int().positive(),
    debug: BooleanConfigSchema
});

const TelegramConfigSchema = z.object({
    telegram_token: z.string().nonempty()
});

const InputSchema = z.object({
    categories: z.string().nonempty()
        .transform((val) => val.split(",").map((s) => s.trim()))
        .pipe(z.array(NewsCategorySchema).nonempty()),
    channels: z.string().nonempty()
        .transform((val) => val.split(",").map((s) => s.trim()))
});

const ErrorHandlerConfigSchema = z.object({
    error_channels: z.string().default("")
        .transform((val) => val?.split(",").map((s) => s.trim()))
});

const CronConfigSchema = z.object({
    cron_expr: z.string().optional(),
    time_zone: z.string().optional()
});

const DagConfigSchema = z.object({
    dag_timeout: z.coerce.number().positive().optional()
});

const TruncateByCategoryOptionsSchema = z.object({
    truncate_num_by_cat: z.string().default("{}").transform((val) => JSON.parse(val))
        .pipe(z.record(NewsCategorySchema, z.number().int().positive())),
    debug: BooleanConfigSchema
});


export const ConfigSchema = DbConfigSchema
    .and(AIClientConfigSchema)
    .and(FetchOptionsSchema.omit({ debug: true }))
    .and(ReadOptionsSchema.omit({ debug: true }))
    .and(FormatNewsOptionsSchema.omit({ debug: true }))
    .and(HistoryNewsOptionsSchema.omit({ debug: true }))
    .and(SendNewsOptionsSchema.omit({ debug: true }))
    .and(SummarizeNewsOptionsSchema.omit({ debug: true }))
    .and(TruncateNewsOptionsSchema)
    .and(TelegramConfigSchema)
    .and(InputSchema)
    .and(ErrorHandlerConfigSchema)
    .and(CronConfigSchema)
    .and(DagConfigSchema)
    .and(FilterRecencyOptionsSchema.omit({ debug: true }))
    .and(TruncateByCategoryOptionsSchema);

export type Config = z.infer<typeof ConfigSchema>;

export const loadConfig = (config_path: string = "./.env"): Config => {
    const { parsed } = dotenv.config({ path: config_path });
    return ConfigSchema.parse(parsed);
};