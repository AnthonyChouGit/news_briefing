import * as z from "zod";
import { type NewsCategory, NewsCategorySchema, type BriefNewsLike } from "../types/brief_news.entity.js";
import { NewsHistory } from "../types/news_history.base.js";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { ErrorInfoSchema, type ErrorInfo } from "../types/error.schema.js";

const HistoryNewsInputSchema = z.object({
    categories: z.array(NewsCategorySchema).nonempty()
});
type HistoryNewsInput = z.infer<typeof HistoryNewsInputSchema>;

const HistoryNewsOutputSchema = z.object({
    history_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type HistoryNewsOutput = z.infer<typeof HistoryNewsOutputSchema>;

const HistoryNewsRequiresSchema = z.object({
    data_src: z.unknown(),
    history_fetcher: z.instanceof(NewsHistory)
});
type HistoryNewsRequires = z.infer<typeof HistoryNewsRequiresSchema>;

const HistoryNewsOptionsSchema = z.object({
    time_window_days: z.number().positive().default(3)
});
type HistoryNewsOptions = z.infer<typeof HistoryNewsOptionsSchema>;

export default async function historyNews({ inputs, requires, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { categories } = inputs as HistoryNewsInput;
        const { data_src, history_fetcher } = requires as HistoryNewsRequires;
        const category_promises: Promise<Map<string, BriefNewsLike>>[] = categories.map(async (category: NewsCategory) => {
            const items: Map<string, BriefNewsLike> = await history_fetcher.fetchHistory(data_src, category, options as HistoryNewsOptions);
            return items
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