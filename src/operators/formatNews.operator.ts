import * as z from "zod";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type NewsCategory, type BriefNewsLike } from "../types/brief_news.entity.js";
import { type ErrorInfo, ErrorInfoSchema } from "../types/error.schema.js";
import { NewsFormat } from "../types/news_format.base.js";
import { FormatNewsOptionsSchema, type FormatNewsOptions } from "../types/config.schema.js";

const FormatNewsInputSchema = z.object({
    format_input_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type FormatNewsInput = z.infer<typeof FormatNewsInputSchema>;

const FormatNewsOutputSchema = z.object({
    news_text: z.string().nonempty()
});
type FormatNewsOutput = z.infer<typeof FormatNewsOutputSchema>;

const FormatNewsRequiresSchema = z.object({
    news_formatter: z.instanceof(NewsFormat)
});
type FormatNewsRequires = z.infer<typeof FormatNewsRequiresSchema>;


export default async function formatNews({ inputs, requires, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { format_input_items } = inputs as FormatNewsInput;
        const { news_formatter } = requires as FormatNewsRequires;
        const news_text = await news_formatter.formatNews(format_input_items, options as FormatNewsOptions);
        const op_output: FormatNewsOutput = { news_text };
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 7, err_obj: err };
        return { branch: "error", output: err_output };
    }
}

export class FormatNewsOperator extends Operator {
    name: string = "format_news";
    input_schema = FormatNewsInputSchema;
    output_schemas = { default: FormatNewsOutputSchema, error: ErrorInfoSchema };
    requires_schema = FormatNewsRequiresSchema;
    options_schema = FormatNewsOptionsSchema;
    exec = formatNews;
}