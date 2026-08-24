import * as z from "zod";
import { type BriefNewsLike } from "../types/brief_news.entity.js";
import { type NewsCategory } from "../types/news_category.enum.js";
import { Piscina } from "piscina";
export const ReadOptionsSchema = z.object({
    read_timeout: z.coerce.number().int().nonnegative().optional(),
    read_user_agent: z.string().nonempty().optional(),
    read_max_body_chars: z.coerce.number().int().nonnegative().optional(),
    read_concurrency: z.coerce.number().int().positive().optional(),
    debug: z.boolean().default(false)
});
export type ReadOptions = z.infer<typeof ReadOptionsSchema>;
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";

const ReadNewsInputSchema = z.object({
    read_input_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type ReadNewsInput = z.infer<typeof ReadNewsInputSchema>;

const ReadNewsOutputSchema = z.object({
    read_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type ReadNewsOutput = z.infer<typeof ReadNewsOutputSchema>;

const ReadNewsRequiresSchema = z.object({
    thread_pool: z.instanceof(Piscina)
});
type ReadNewsRequires = z.infer<typeof ReadNewsRequiresSchema>;

export default async function readNews({ inputs, requires, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { read_input_items } = inputs as ReadNewsInput;
        const { thread_pool } = requires as ReadNewsRequires;
        const read_options = options as ReadOptions;
        const isDebug = read_options?.debug;

        if (read_input_items.size === 0) {
            throw new Error("Categories map cannot be empty.");
        }

        let inputCounts = "";
        if (isDebug) {
            inputCounts = Array.from(
                read_input_items.entries(),
                ([category, items]) => `${category}: ${items.size}`
            ).join(", ");
        }

        const tasks = Array.from(read_input_items.values(), (items) => {
            if (items.size === 0)
                return Promise.resolve(items);
            return thread_pool.run({ items, options: read_options },
                { name: 'readNewsDetails', filename: new URL('./workers/_read.js', import.meta.url).href });
        }
        );
        const results = await Promise.allSettled(tasks);
        const categories: NewsCategory[] = [...read_input_items.keys()];
        for (let i = 0; i < categories.length; i++) {
            const result = results[i]!;
            if (result.status === 'rejected') {
                console.error(`[READ] Category "${categories[i]!}" failed:`, result.reason);
                read_input_items.delete(categories[i]!);
                continue;
            }
            const items: Map<string, BriefNewsLike> = result.value as Map<string, BriefNewsLike>;
            // Delete items without raw content.
            items.forEach((item, hash_id) => {
                if (!item.raw || item.raw.length === 0)
                    items.delete(hash_id);
            });
            if (items.size === 0)
                read_input_items.delete(categories[i]!);
            else
                read_input_items.set(categories[i]!, items);
        }

        if (read_input_items.size === 0) {
            throw new Error("All categories failed to read.");
        }

        if (isDebug) {
            const outputCounts = Array.from(
                read_input_items.entries(),
                ([category, items]) => `${category}: ${items.size}`
            ).join(", ");
            console.log(`[READ] Input items per category: ${inputCounts}`);
            console.log(`[READ] Output items per category: ${outputCounts}`);
        }

        const op_output: ReadNewsOutput = { read_items: read_input_items };
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 4, err_obj: err };
        return { branch: "error", output: err_output };
    }
}

export class ReadNewsOperator extends Operator {
    name: string = "read_news";
    input_schema = ReadNewsInputSchema;
    output_schemas = { default: ReadNewsOutputSchema, error: ErrorInfoSchema };
    requires_schema = ReadNewsRequiresSchema;
    options_schema = ReadOptionsSchema;
    exec = readNews;
}