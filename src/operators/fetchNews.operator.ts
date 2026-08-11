import { Operator, type OperatorArgs, type OperatorOutput } from "../light-dag/operator.js";
import * as z from "zod";
import { NewsCategorySchema, type BriefNewsLike, type NewsCategory } from "../types/brief_news.entity.js";
import { Piscina } from "piscina";
import { ErrorInfoSchema, type ErrorInfo } from "./common/errors.js";
import { FetchOptionsSchema, type FetchOptions } from "../types/config.schema.js";

const FetchNewsInputSchema = z.object({
    categories: z.array(NewsCategorySchema).nonempty()
});
type FetchNewsInput = z.infer<typeof FetchNewsInputSchema>;

const FetchNewsOutputSchema = z.object({
    fetched_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type FetchNewsOutput = z.infer<typeof FetchNewsOutputSchema>;

const FetchNewsRequiresSchema = z.object({
    thread_pool: z.instanceof(Piscina)
});
type FetchNewsRequires = z.infer<typeof FetchNewsRequiresSchema>;

export default async function fetchNews({ inputs, requires, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { categories } = inputs as FetchNewsInput;
        const { thread_pool } = requires as FetchNewsRequires;
        const fetch_options = options as FetchOptions;

        if (categories.length === 0) {
            throw new Error("Categories array cannot be empty.");
        }

        const tasks = categories.map((category: NewsCategory) =>
            thread_pool.run({ category, options: fetch_options },
                { name: 'fetchNewsByCategory', filename: new URL('./workers/_fetch.js', import.meta.url).href })
        );

        const results = await Promise.allSettled(tasks);
        const all_categories = new Map<NewsCategory, Map<string, BriefNewsLike>>();

        for (let i = 0; i < categories.length; i++) {
            const result = results[i]!;
            const category: NewsCategory = categories[i]!;

            if (result.status === 'rejected') {
                console.error(`[FETCH] Category "${category}" failed:`, result.reason);
                continue;
            }

            const category_items: Map<string, BriefNewsLike> = result.value as Map<string, BriefNewsLike>;
            all_categories.set(category, category_items);
        }

        if (all_categories.size === 0) {
            throw new Error("All categories failed to fetch.");
        }

        const op_output: FetchNewsOutput = { fetched_items: all_categories };
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 1, err_obj: err };
        return { branch: "error", output: err_output };
    }
}

export class FetchNewsOperator extends Operator {
    name: string = "fetch_news";
    input_schema = FetchNewsInputSchema;
    output_schemas = { default: FetchNewsOutputSchema, error: ErrorInfoSchema };
    requires_schema = FetchNewsRequiresSchema;
    options_schema = FetchOptionsSchema;
    exec = fetchNews;
}