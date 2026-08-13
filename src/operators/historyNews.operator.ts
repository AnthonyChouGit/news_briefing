import * as z from "zod";
import { Repository, MoreThanOrEqual } from "typeorm";
import { BriefNews, type BriefNewsLike } from "../types/brief_news.entity.js";
import { type NewsCategory, NewsCategorySchema } from "../types/news_category.enum.js";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { ErrorInfoSchema, type ErrorInfo } from "./common/errors.js";
export const HistoryNewsOptionsSchema = z.object({
    time_window_days: z.number().positive().default(3)
});
export type HistoryNewsOptions = z.infer<typeof HistoryNewsOptionsSchema>;



const HistoryNewsInputSchema = z.object({
    categories: z.array(NewsCategorySchema).nonempty()
});
type HistoryNewsInput = z.infer<typeof HistoryNewsInputSchema>;

const HistoryNewsOutputSchema = z.object({
    history_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type HistoryNewsOutput = z.infer<typeof HistoryNewsOutputSchema>;

const HistoryNewsRequiresSchema = z.object({
    repository: z.instanceof(Repository)
});
type HistoryNewsRequires = z.infer<typeof HistoryNewsRequiresSchema>;

export default async function historyNews({ inputs, requires, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { categories } = inputs as HistoryNewsInput;
        const repository = requires.repository as Repository<BriefNews>;
        const category_promises: Promise<Map<string, BriefNewsLike>>[] = categories.map(async (category: NewsCategory) => {
            const items: BriefNews[] = await repository.find({
                where: {
                    category: category,
                    source_date: MoreThanOrEqual(new Date(Date.now() - 24 * 60 * 60 * 1000 * (options as HistoryNewsOptions).time_window_days))
                }
            });
            return new Map(items.map(item => [item.hash_id, item]));
        });
        const items = await Promise.all(category_promises);
        const history_items = new Map<NewsCategory, Map<string, BriefNewsLike>>();
        for (let i = 0; i < categories.length; i++) {
            history_items.set(categories[i]!, items[i]!);
        }
        const op_output: HistoryNewsOutput = { history_items };
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 6, err_obj: err };
        return { branch: "error", output: err_output };
    }
}

export class HistoryNewsOperator extends Operator {
    name: string = "history_news";
    input_schema = HistoryNewsInputSchema;
    output_schemas = { default: HistoryNewsOutputSchema, error: ErrorInfoSchema };
    requires_schema = HistoryNewsRequiresSchema;
    options_schema = HistoryNewsOptionsSchema;
    exec = historyNews;
}