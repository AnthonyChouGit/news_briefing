import * as z from "zod";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";
import { type BriefNewsLike } from "../types/brief_news.entity.js";
import { type NewsCategory } from "../types/news_category.enum.js";

export const TruncateNewsOptionsSchema = z.object({
    truncate_max_items_per_category: z.coerce.number().int().positive().optional().default(5),
    debug: z.coerce.boolean().default(false)
});
export type TruncateNewsOptions = z.infer<typeof TruncateNewsOptionsSchema>;

const TruncateNewsInputSchema = z.object({
    truncate_input_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type TruncateNewsInput = z.infer<typeof TruncateNewsInputSchema>;

const TruncateNewsOutputSchema = z.object({
    truncated_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type TruncateNewsOutput = z.infer<typeof TruncateNewsOutputSchema>;

export default async function truncateNews({ inputs, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const deduped_items: Map<NewsCategory, Map<string, BriefNewsLike>> = (inputs as TruncateNewsInput).truncate_input_items;
        const max_items_per_category: number = (options as TruncateNewsOptions).truncate_max_items_per_category;
        const truncated_items = new Map<NewsCategory, Map<string, BriefNewsLike>>(
            Array.from(deduped_items.entries(), ([category, items]) => {
                if (items.size <= max_items_per_category)
                    return [category, items];
                const output_items = new Map<string, BriefNewsLike>();
                let count = 0;
                for (const [hash_id, item] of items.entries()) {
                    if (count >= max_items_per_category)
                        break;
                    output_items.set(hash_id, item);
                    count++;
                }
                return [category, output_items];
            })
        );
        return { branch: "default", output: { truncated_items } };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 3, err_obj: err };
        return { branch: "error", output: err_output };
    }
}

export class TruncateNewsOperator extends Operator {
    name: string = "truncate_news";
    input_schema = TruncateNewsInputSchema;
    output_schemas = { default: TruncateNewsOutputSchema, error: ErrorInfoSchema };
    options_schema = TruncateNewsOptionsSchema;
    exec = truncateNews;
}