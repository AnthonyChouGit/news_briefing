import * as z from "zod";
import { type NewsCategory, type BriefNewsLike } from "../types/brief_news.entity.js";
import { NewsSummarizer } from "../utils/summarize.js";
import { AIClient } from "../types/ai_client.base.js";
import { LanguageSchema } from "../types/language.enum.js";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "../types/error.schema.js";

const SummarizeNewsInputSchema = z.object({
    summarize_input_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type SummarizeNewsInput = z.infer<typeof SummarizeNewsInputSchema>;

const SummarizeNewsOutputSchema = z.object({
    summarized_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type SummarizeNewsOutput = z.infer<typeof SummarizeNewsOutputSchema>;

const SummarizeNewsRequiresSchema = z.object({
    news_summarizer: z.instanceof(NewsSummarizer),
    ai_client: z.instanceof(AIClient)
});
type SummarizeNewsRequires = z.infer<typeof SummarizeNewsRequiresSchema>;

const SummarizeNewsOptionsSchema = z.object({
    language: LanguageSchema
});
type SummarizeNewsOptions = z.infer<typeof SummarizeNewsOptionsSchema>;

export default async function summarizeNews({ inputs, requires, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { summarize_input_items } = inputs as SummarizeNewsInput;
        const { news_summarizer, ai_client } = requires as SummarizeNewsRequires;
        const language = (options as SummarizeNewsOptions).language;
        const summarize_promises = Array.from(summarize_input_items.entries()).map(async ([category, items]) => {
            await news_summarizer.summarizeEvents(items, ai_client, language);
        });
        await Promise.all(summarize_promises);
        const op_output: SummarizeNewsOutput = { summarized_items: summarize_input_items };
        return { branch: "default", output: op_output };
    } catch (err) {
        const err_output: ErrorInfo = { err_code: 5, err_obj: err };
        return { branch: "error", output: err_output };
    }
}

export class SummarizeNewsOperator extends Operator {
    name: string = "summarize_news";
    input_schema = SummarizeNewsInputSchema;
    output_schemas = { default: SummarizeNewsOutputSchema, error: ErrorInfoSchema };
    requires_schema = SummarizeNewsRequiresSchema;
    options_schema = SummarizeNewsOptionsSchema;
    exec = summarizeNews;
}
