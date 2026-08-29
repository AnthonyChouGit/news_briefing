import * as z from "zod";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";
import { type BriefNewsLike } from "../types/brief_news.entity.js";
import { type NewsCategory, NewsCategorySchema } from "../types/news_category.enum.js";

export const TruncateByCategoryOptionsSchema = z.object({
    truncate_num_by_cat: z.record(NewsCategorySchema, z.number().int().positive()).default({} as Record<NewsCategory, number>),
    truncate_max_items_per_category: z.coerce.number().int().positive(),
    debug: z.boolean().default(false)
});
export type TruncateByCategoryOptions = z.infer<typeof TruncateByCategoryOptionsSchema>;

export const TruncateByCategoryInputSchema = z.object({
    truncate_by_cat_input_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
export type TruncateByCategoryInput = z.infer<typeof TruncateByCategoryInputSchema>;

export const TruncateByCategoryOutputSchema = z.object({
    truncate_by_cat_output_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
export type TruncateByCategoryOutput = z.infer<typeof TruncateByCategoryOutputSchema>;

export default async function truncateByCategory({ inputs, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const input_items: Map<NewsCategory, Map<string, BriefNewsLike>> = (inputs as TruncateByCategoryInput).truncate_by_cat_input_items;
        const { truncate_num_by_cat, debug, truncate_max_items_per_category } = options as TruncateByCategoryOptions;

        let originalCounts = "";
        if (debug) {
            originalCounts = Array.from(
                input_items.entries(),
                ([category, items]) => `${category}: ${items.size}`
            ).join(", ");
        }

        for (const [category, items] of input_items.entries()) {
            const num = truncate_num_by_cat[category] ?? truncate_max_items_per_category;
            if (items.size > num) {
                input_items.set(category, new Map(Array.from(items.entries()).slice(0, num)));
            }
        }

        if (debug) {
            const remainingCounts = Array.from(
                input_items.entries(),
                ([category, items]) => `${category}: ${items.size}`
            ).join(", ");
            console.log(`[TRUNCATE BY CAT] Original items per category: ${originalCounts}`);
            console.log(`[TRUNCATE BY CAT] Remaining items per category: ${remainingCounts}`);
        }

        const op_output: TruncateByCategoryOutput = { truncate_by_cat_output_items: input_items };
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 12, err_obj: err };
        return { branch: "error", output: err_output };
    }
};

export class TruncateByCategoryOperator extends Operator {
    name: string = "truncate_by_cat";
    input_schema = TruncateByCategoryInputSchema;
    output_schemas = { default: TruncateByCategoryOutputSchema, error: ErrorInfoSchema };
    options_schema = TruncateByCategoryOptionsSchema;
    exec = truncateByCategory;
}
