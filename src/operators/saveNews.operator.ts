import * as z from "zod";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type NewsCategory, type BriefNewsLike } from "../types/brief_news.entity.js";
import { NewsHistory } from "../types/news_history.base.js";
import { type ErrorInfo, ErrorInfoSchema } from "../types/error.schema.js";

const SaveNewsInputSchema = z.object({
    save_input_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type SaveNewsInput = z.infer<typeof SaveNewsInputSchema>;

const SaveNewsOutputSchema = z.object({
    saved: z.boolean().default(true)
});
type SaveNewsOutput = z.infer<typeof SaveNewsOutputSchema>;

const SaveNewsRequiresSchema = z.object({
    data_src: z.unknown(),
    history_saver: z.instanceof(NewsHistory)
});
type SaveNewsRequires = z.infer<typeof SaveNewsRequiresSchema>;

export default async function saveNews({ inputs, requires }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { save_input_items } = inputs as SaveNewsInput;
        const { data_src, history_saver } = requires as SaveNewsRequires;
        const save_promises: Promise<void>[] = Array.from(save_input_items.values(), async (items: Map<string, BriefNewsLike>) => {
            await history_saver.saveHistory(data_src, items);
        });
        await Promise.all(save_promises);
        const op_output: SaveNewsOutput = { saved: true };
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 7, err_obj: err };
        return { branch: "error", output: { err_output } };
    }
}

export class SaveNewsOperator extends Operator {
    name: string = "save_news";
    input_schema = SaveNewsInputSchema;
    output_schemas = { default: SaveNewsOutputSchema, error: ErrorInfoSchema };
    requires_schema = SaveNewsRequiresSchema;
    exec = saveNews;
}