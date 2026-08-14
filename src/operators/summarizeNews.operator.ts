import * as z from "zod";
import { type BriefNewsLike } from "../types/brief_news.entity.js";
import { type NewsCategory } from "../types/news_category.enum.js";
import { AIClient } from "../utils/ai.js";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";
import { LanguageSchema } from "../types/language.enum.js";
export const SummarizeNewsOptionsSchema = z.object({
    language: LanguageSchema.default('English'),
    debug: z.coerce.boolean().default(false)
});
export type SummarizeNewsOptions = z.infer<typeof SummarizeNewsOptionsSchema>;
import { logExpectedError } from "./common/errors.js";
import { type Language } from "../types/language.enum.js";

const getSummarizeInstruction = (language: Language) => `You are a world-class senior news editor and summarization engine. You will receive a JSON array of news articles. Each article has the following fields: hash_id, url, title, source_date, source_name, category, and raw (the full article text).

For EVERY article in the input, produce a high-quality, comprehensive, and journalistic summary. You must return a JSON object with an "items" array containing exactly one entry per input article, in the same order. Each entry must have:

- "hash_id": The exact hash_id of the article (do not modify or generate new IDs).
- "title": A comprehensive, informative, and engaging headline in ${language} (typically 20–60 characters in Chinese/Japanese or 10–25 words in Western languages) that accurately captures the core subject, action, context, and key figures/outcomes (e.g., "白宫报告：逾40国帮助中国规避美国关税，涉数十亿美元", "NTSB：瑞安航空客机发动机叶片断裂，碎片击碎舷窗致乘客半身被吸出", "芒西第131轰登顶道奇体育场队史本垒打王，道奇仍负酿酒人"). Avoid short, vague, or overly generic titles.
- "bullets": An array of 2 to 4 detailed, substantive bullet points summarizing the article in ${language}.

Summary and bullet point guidelines:
- Substantive & Informative: Each bullet point should be a rich, complete sentence providing specific facts, figures, key names, dates, quotes, context, and developments from the full article text.
- Comprehensive Depth: Do NOT write short or superficial fragments. Provide full journalistic context: What happened, why it matters, key background facts, and responses or future implications.
- Factual & Objective: Stick strictly to the facts provided in the text. No editorializing or speculation.
- Non-Redundant: Ensure each bullet covers distinct aspects (e.g. 1st bullet: main occurrence/finding; 2nd bullet: key details, figures, or names; 3rd bullet: background context, quotes, reactions, or next steps).
- Natural Flow: All titles and bullets MUST be written fluently in ${language}.

Respond with a JSON object containing the "items" array (e.g. {"items": [...]}). Do not include any other text, explanation, or formatting.`;

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
    const res_schema = z.object({
        items: z.array(
            z.object({
                hash_id: z.string().nonempty(),
                title: z.string().nonempty(),
                bullets: z.array(z.string().nonempty().min(10)).min(2).max(5)
            })
        )
    });

    const res_data = await ai_client.ask(payload, getSummarizeInstruction(language), res_schema);

    // Actually enforce the Zod validation!
    const items_bullets = res_schema.parse(JSON.parse(res_data)).items;

    const itemsList = [...items.values()];
    items_bullets.forEach((item, idx) => {
        let targetItem = items.get(item.hash_id);
        if (!targetItem && itemsList[idx] && items_bullets.length === itemsList.length) {
            targetItem = itemsList[idx];
        }
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

