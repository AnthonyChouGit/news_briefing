import * as z from "zod";
import { type NewsCategory, type BriefNewsLike } from "../types/brief_news.entity.js";
import { EventDeduplicator } from "../utils/dedupe.js";
import { AIClient } from "../types/ai_client.base.js";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "../types/error.schema.js";

const DedupeNewsInputSchema = z.object({
    read_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>),
    history_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type DedupeNewsInput = z.infer<typeof DedupeNewsInputSchema>;

const DedupeNewsOutputSchema = z.object({
    deduped_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type DedupeNewsOutput = z.infer<typeof DedupeNewsOutputSchema>;

const DedupeNewsRequiresSchema = z.object({
    deduplicator: z.instanceof(EventDeduplicator),
    ai_client: z.instanceof(AIClient)
});
type DedupeNewsRequires = z.infer<typeof DedupeNewsRequiresSchema>;

export default async function dedupeNews({ inputs, requires }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { read_items, history_items } = inputs as DedupeNewsInput;
        const { deduplicator, ai_client } = requires as DedupeNewsRequires;
        const dedupePromises = Array.from(read_items.entries()).map(async ([category, items]) => {
            if (history_items.has(category)) {
                deduplicator.dedupeById(items, Array.from(history_items.get(category)!.keys()));
                await deduplicator.dedupeByEvent(items, history_items.get(category)!, ai_client);
            }
        });
        await Promise.all(dedupePromises);
        const op_output: DedupeNewsOutput = { deduped_items: read_items };
        return { branch: "default", output: op_output };

    } catch (error) {
        const err_output: ErrorInfo = { err_code: 3, err_obj: error };
        return { branch: "error", output: err_output };
    }
}

export class DedupeNewsOperator extends Operator {
    name: string = "dedupe_news";
    input_schema = DedupeNewsInputSchema;
    output_schemas = { default: DedupeNewsOutputSchema, error: ErrorInfoSchema };
    requires_schema = DedupeNewsRequiresSchema;
    exec = dedupeNews;
}