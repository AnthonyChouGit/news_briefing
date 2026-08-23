import * as z from "zod";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";
import { type BriefNewsLike } from "../types/brief_news.entity.js";
import { type NewsCategory } from "../types/news_category.enum.js";

export const TruncateNewsOptionsSchema = z.object({
    truncate_max_items_per_category: z.coerce.number().int().positive(),
    debug: z.boolean().default(false)
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

const randomTruncate = <T>(items: T[], max_num: number): T[] => {
    if (items.length <= max_num)
        return items;

    const picked: T[] = [];
    for (let i = 0; i < max_num && items.length > 0; i++) {
        const idx = Math.floor(Math.random() * items.length);
        picked.push(items.splice(idx, 1)[0]!);
    }
    return picked;
}

export default async function truncateNews({ inputs, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const input_items: Map<NewsCategory, Map<string, BriefNewsLike>> = (inputs as TruncateNewsInput).truncate_input_items;
        const max_items_per_category: number = (options as TruncateNewsOptions).truncate_max_items_per_category;
        const truncated_items = new Map<NewsCategory, Map<string, BriefNewsLike>>(
            Array.from(input_items.entries(), ([category, items]) => {
                return [category, new Map(randomTruncate(Array.from(items.entries()), max_items_per_category))];
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