import * as z from "zod";
import { type BriefNewsLike } from "../types/brief_news.entity.js";
import { type NewsCategory } from "../types/news_category.enum.js";
import { AIClient } from "../utils/ai.js";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";
import { LanguageSchema } from "../types/language.enum.js";
export const SummarizeNewsOptionsSchema = z.object({
    language: LanguageSchema
});
export type SummarizeNewsOptions = z.infer<typeof SummarizeNewsOptionsSchema>;
import { logExpectedError } from "./common/errors.js";
import { type Language } from "../types/language.enum.js";

const getSummarizeInstruction = (language: Language) => `You are a news summarization engine. You will receive a JSON array of news articles. Each article has the following fields: hash_id, url, title, source_date, source_name, category, and raw (the full article text).

For EVERY article in the input, produce a concise summary as bullet points. You must return a JSON array with exactly one entry per input article, in the same order. Each entry must have:

- "hash_id": The exact hash_id of the article (do not modify or generate new IDs).
- "title": A rewritten title in ${language} that accurately describes the news.
- "bullets": An array of 3 to 5 bullet points summarizing the article in ${language}.

Bullet point rules:
- Each bullet must be a single, complete sentence or phrase that captures one key fact or takeaway.
- Each bullet must be between 10 and 50 characters long. This is a hard limit — do not exceed it or fall short.
- Bullets should be informative and specific. Avoid vague or generic statements like "The article discusses..." or "Details were provided."
- Prioritize the most newsworthy facts: who, what, when, where, and why.
- Do not repeat information across bullets.
- Do not include opinions or editorializing. Stick to factual reporting.
- ALL titles and bullets MUST be written in ${language}.

Respond with ONLY the JSON array. Do not include any other text, explanation, or formatting.`;

const SummarizeNewsInputSchema = z.object({
    summarize_input_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type SummarizeNewsInput = z.infer<typeof SummarizeNewsInputSchema>;

const SummarizeNewsOutputSchema = z.object({
    summarized_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type SummarizeNewsOutput = z.infer<typeof SummarizeNewsOutputSchema>;

const SummarizeNewsRequiresSchema = z.object({
    ai_client: z.instanceof(AIClient)
});
type SummarizeNewsRequires = z.infer<typeof SummarizeNewsRequiresSchema>;

async function summarizeEvents(items: Map<string, BriefNewsLike>, ai_client: AIClient, language: Language = 'English'): Promise<Map<string, BriefNewsLike>> {
    if (items.size === 0)
        return items;
    const payload: string = JSON.stringify([...items.values()]);
    const res_schema = z.array(
        z.object({
            hash_id: z.enum([...items.keys()]),
            title: z.string().nonempty(),
            bullets: z.array(z.string().nonempty().min(10).max(50)).min(3).max(5)
        })
    ).length(items.size);

    const res_data = await ai_client.ask(payload, getSummarizeInstruction(language), res_schema);

    // Actually enforce the Zod validation!
    const items_bullets = res_schema.parse(JSON.parse(res_data));

    items_bullets.forEach((item) => {
        const targetItem = items.get(item.hash_id);
        if (targetItem) {
            targetItem.bullets = item.bullets;
            targetItem.title = item.title;
        } else {
            logExpectedError(new Error(`[Summarize] AI returned an unknown hash_id: ${item.hash_id}`));
        }
    });
    return items;
}

export default async function summarizeNews({ inputs, requires, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { summarize_input_items } = inputs as SummarizeNewsInput;
        const { ai_client } = requires as SummarizeNewsRequires;
        const language = (options as SummarizeNewsOptions).language;
        const summarize_promises = Array.from(summarize_input_items.entries()).map(async ([category, items]) => {
            await summarizeEvents(items, ai_client, language);
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

