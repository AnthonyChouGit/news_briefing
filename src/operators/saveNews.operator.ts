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

export default async function saveNews({ inputs, requires }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { save_input_items } = inputs as SaveNewsInput;
        const repository = requires.repository as Repository<BriefNews>;
        const save_promises: Promise<void>[] = Array.from(save_input_items.values(), async (items: Map<string, BriefNewsLike>) => {
            const entities = [...items.values()].map(item => repository.create(item));
            await repository.save(entities);
        });
        await Promise.all(save_promises);
        const op_output: SaveNewsOutput = { saved: true };
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 9, err_obj: err };
        return { branch: "error", output: err_output };
    }
}

export class SaveNewsOperator extends Operator {
    name: string = "save_news";
    input_schema = SaveNewsInputSchema;
    output_schemas = { default: SaveNewsOutputSchema, error: ErrorInfoSchema };
    requires_schema = SaveNewsRequiresSchema;
    exec = saveNews;
}