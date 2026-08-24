import * as z from "zod";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";
import { type BriefNewsLike } from "../types/brief_news.entity.js";
import { type NewsCategory } from "../types/news_category.enum.js";

const FilterRecencyInputSchema = z.object({
    filter_recency_input_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type FilterRecencyInput = z.infer<typeof FilterRecencyInputSchema>;

const FilterRecencyOutputSchema = z.object({
    filtered_recency_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type FilterRecencyOutput = z.infer<typeof FilterRecencyOutputSchema>;

export const FilterRecencyOptionsSchema = z.object({
    filter_recency_td_hours: z.coerce.number().positive().default(24),
    debug: z.boolean().default(false)
});
export type FilterRecencyOptions = z.infer<typeof FilterRecencyOptionsSchema>;

export default async function filterRecency({ inputs, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { filter_recency_input_items } = inputs as FilterRecencyInput;
        const { filter_recency_td_hours, debug } = options as FilterRecencyOptions;
        const earliest = new Date(Date.now() - filter_recency_td_hours * 60 * 60 * 1000);
        let count = 0;
        for (const [category, items] of filter_recency_input_items.entries()) {
            for (const [hash_id, item] of items.entries()) {
                if (item.source_date && item.source_date < earliest) {
                    items.delete(hash_id);
                    count++;
                }
            }
        }
        if (debug) {
            const remaining = Array.from(filter_recency_input_items.values()).reduce((sum, map) => sum + map.size, 0);
            const remainingCounts = Array.from(
                filter_recency_input_items.entries(),
                ([category, items]) => `${category}: ${items.size}`
            ).join(", ");
            console.log(`[FilterRecency] Filtered ${count} items older than ${filter_recency_td_hours} hours (remaining: ${remaining}, per category: ${remainingCounts})`);
        }
        const op_output: OperatorOutput = { branch: "default", output: { filtered_recency_items: filter_recency_input_items } };
        return op_output;
    } catch (error) {
        const err_output: OperatorOutput = { branch: "error", output: { err_code: 11, err_obj: error } };
        return err_output;
    }
}

export class FilterRecencyOperator extends Operator {
    name: string = "filter_recency";
    input_schema = FilterRecencyInputSchema;
    output_schemas = { default: FilterRecencyOutputSchema, error: ErrorInfoSchema };
    options_schema = FilterRecencyOptionsSchema;
    exec = filterRecency;
}