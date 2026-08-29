import * as z from "zod";
import { Repository } from "typeorm";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { BriefNews, type BriefNewsLike } from "../types/brief_news.entity.js";
import { type NewsCategory } from "../types/news_category.enum.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";



const SaveNewsInputSchema = z.object({
    save_input_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type SaveNewsInput = z.infer<typeof SaveNewsInputSchema>;

const SaveNewsOutputSchema = z.object({
    saved: z.boolean().default(true)
});
type SaveNewsOutput = z.infer<typeof SaveNewsOutputSchema>;

const SaveNewsRequiresSchema = z.object({
    repository: z.instanceof(Repository)
});
type SaveNewsRequires = z.infer<typeof SaveNewsRequiresSchema>;

export default async function saveNews({ inputs, requires, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { save_input_items } = inputs as SaveNewsInput;
        const repository = requires.repository as Repository<BriefNews>;
        const save_options = options as SaveNewsOptions;

        const save_promises: Promise<void>[] = Array.from(save_input_items.values(), async (items: Map<string, BriefNewsLike>) => {
            const entities = [...items.values()].map(item => repository.create(item));
            if (entities.length > 0) {
                await repository.upsert(entities, {
                    conflictPaths: ["hash_id"],
                    skipUpdateIfNoValuesChanged: true
                });
            }
        });
        await Promise.all(save_promises);

        if (save_options?.debug) {
            const categoryCounts = Array.from(
                save_input_items.entries(),
                ([category, items]) => `${category}: ${items.size}`
            ).join(", ");
            const totalSaved = Array.from(save_input_items.values()).reduce((sum, map) => sum + map.size, 0);
            console.log(`[SAVE] Items saved per category: ${categoryCounts} (total: ${totalSaved})`);
        }

        const op_output: SaveNewsOutput = { saved: true };
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 9, err_obj: err };
        return { branch: "error", output: err_output };
    }
}

export const SaveNewsOptionsSchema = z.object({
    debug: z.boolean().default(false)
});
export type SaveNewsOptions = z.infer<typeof SaveNewsOptionsSchema>;

export class SaveNewsOperator extends Operator {
    name: string = "save_news";
    input_schema = SaveNewsInputSchema;
    output_schemas = { default: SaveNewsOutputSchema, error: ErrorInfoSchema };
    requires_schema = SaveNewsRequiresSchema;
    options_schema = SaveNewsOptionsSchema;
    exec = saveNews;
}