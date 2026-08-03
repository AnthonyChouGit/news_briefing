import { Operator, type OperatorArgs, type OperatorOutput } from "../light-dag/operator.js";
import { NewsFetcher } from "../utils/fetch.js";
import * as z from "zod";
import { BriefNewsLikeSchema, NewsCategorySchema, type BriefNewsLike, type NewsCategory } from "../types/brief_news.entity.js";
import { Piscina } from "piscina";
import { ErrorInfoSchema, type ErrorInfo } from "../types/error.schema.js";

const FetchNewsInputSchema = z.object({
    categories: z.array(NewsCategorySchema).nonempty()
});
type FetchNewsInput = z.infer<typeof FetchNewsInputSchema>;

const FetchNewsOutputSchema = z.object({
    fetched_items: z.map(NewsCategorySchema, z.map(z.string(), BriefNewsLikeSchema))
});
type FetchNewsOutput = z.infer<typeof FetchNewsOutputSchema>;

const FetchNewsRequiresSchema = z.object({
    news_fetcher: z.instanceof(NewsFetcher),
    thread_pool: z.instanceof(Piscina)
});
type FetchNewsRequires = z.infer<typeof FetchNewsRequiresSchema>;

const FetchNewsOptionsSchema = z.object({
    timeout: z.coerce.number().int().nonnegative().optional(),
    maxDecodeItems: z.coerce.number().int().nonnegative().optional(),
    userAgent: z.string().nonempty().optional()
}).default({});
type FetchNewsOptions = z.infer<typeof FetchNewsOptionsSchema>;

export default async function fetchNews({ inputs, requires, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { categories } = FetchNewsInputSchema.parse(inputs);
        const { news_fetcher, thread_pool } = FetchNewsRequiresSchema.parse(requires);
        const fetch_options: FetchNewsOptions = FetchNewsOptionsSchema.parse(options);
        const fetched: Map<NewsCategory, Map<string, BriefNewsLike>> = await news_fetcher.fetch(categories, thread_pool, fetch_options);
        const op_output: FetchNewsOutput = FetchNewsOutputSchema.parse({ fetched_items: fetched });
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 1, err_obj: err };
        return { branch: "error", output: ErrorInfoSchema.parse({ err_output }) };
    }
}

export class FetchNewsOperator extends Operator {
    name: string = "fetch_news";
    input_schema = FetchNewsInputSchema;
    output_schemas = { default: FetchNewsOutputSchema, error: ErrorInfoSchema };
    requires_schema = FetchNewsRequiresSchema;
    options_schema = FetchNewsOptionsSchema;
    exec = fetchNews;
}