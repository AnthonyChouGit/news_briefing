import * as z from "zod";
import { type NewsCategory, type BriefNewsLike, NewsCategorySchema, BriefNewsLikeSchema } from "../types/brief_news.entity.js";
import { NewsReader } from "../utils/read.js";
import { Piscina } from "piscina";
import { ReadOptionsSchema, type ReadOptions } from "../types/config.schema.js";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "../types/error.schema.js";

const ReadNewsInputSchema = z.object({
    read_input_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type ReadNewsInput = z.infer<typeof ReadNewsInputSchema>;

const ReadNewsOutputSchema = z.object({
    read_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type ReadNewsOutput = z.infer<typeof ReadNewsOutputSchema>;

const ReadNewsRequiresSchema = z.object({
    news_reader: z.instanceof(NewsReader),
    thread_pool: z.instanceof(Piscina)
});
type ReadNewsRequires = z.infer<typeof ReadNewsRequiresSchema>;

export default async function readNews({ inputs, requires, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { read_input_items } = inputs as ReadNewsInput;
        const { news_reader, thread_pool } = requires as ReadNewsRequires;
        const read_options = options as ReadOptions;
        const read_items: Map<NewsCategory, Map<string, BriefNewsLike>> = await news_reader.read(read_input_items, thread_pool, read_options);
        const op_output: ReadNewsOutput = { read_items };
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 4, err_obj: err };
        return { branch: "error", output: err_output };
    }
}

export class ReadNewsOperator extends Operator {
    name: string = "read_news";
    input_schema = ReadNewsInputSchema;
    output_schemas = { default: ReadNewsOutputSchema, error: ErrorInfoSchema };
    requires_schema = ReadNewsRequiresSchema;
    options_schema = ReadOptionsSchema;
    exec = readNews;
}