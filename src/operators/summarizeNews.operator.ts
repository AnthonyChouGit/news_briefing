import * as z from "zod";
import { type BriefNewsLike } from "../types/brief_news.entity.js";
import { type NewsCategory } from "../types/news_category.enum.js";
import { AIClient } from "../utils/ai.js";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";
import { LanguageSchema, type Language } from "../types/language.enum.js";
export const SummarizeNewsOptionsSchema = z.object({
    language: LanguageSchema.default('English'),
    summarize_min_chars: z.coerce.number().positive(),
    summarize_max_chars: z.coerce.number().positive(),
    summarize_min_bullets: z.coerce.number().int().positive(),
    summarize_max_bullets: z.coerce.number().int().positive(),
    debug: z.boolean().default(false)
});
export type SummarizeNewsOptions = z.infer<typeof SummarizeNewsOptionsSchema>;

const getSummarizeInstruction = (options: SummarizeNewsOptions) => {
    const {
        language,
        summarize_min_chars,
        summarize_max_chars,
        summarize_min_bullets,
        summarize_max_bullets
    } = options;

    const bulletCountDesc = summarize_min_bullets === summarize_max_bullets
        ? `${summarize_min_bullets}`
        : `${summarize_min_bullets} to ${summarize_max_bullets}`;

    return `You are a world-class senior news editor and summarization engine. You will receive a JSON array of news articles. Each article has the following fields: hash_id, url, title, source_date, source_name, category, and raw (the full article text).

CONTENT QUALITY FILTER (APPLY FIRST):
Before summarizing, evaluate each article's "raw" field. EXCLUDE any article where the raw text does NOT contain substantive, reportable content. Common exclusion cases:
- The raw text is mostly or entirely a repetition of the headline/title with no additional detail.
- The raw text consists only of website boilerplate, navigation elements, cookie notices, login prompts, or error/retry messages.
- The raw text is a video/media page placeholder with no transcript or written reporting (e.g. "No results found", "Try again later").
- The raw text is too short (fewer than ~50 words of actual article content) to produce a meaningful summary.
Do NOT include excluded articles in your response at all — simply omit them from the "items" array.

For every REMAINING article that passes the content quality filter, produce a high-quality, comprehensive, and journalistic summary. Return a JSON object with an "items" array containing one entry per included article, preserving their original relative order. Each entry must have:

- "hash_id": The exact hash_id of the article (do not modify or generate new IDs).
- "title": A comprehensive, informative, and engaging headline in ${language} (typically 20–60 characters in Chinese/Japanese or 10–25 words in Western languages) that accurately captures the core subject, action, context, and key figures/outcomes (e.g., 白宫报告：逾40国帮助中国规避美国关税，涉数十亿美元, NTSB：瑞安航空客机发动机叶片断裂，碎片击碎舷窗致乘客半身被吸出, 芒西第131轰登顶道奇体育场队史本垒打王，道奇仍负酿酒人). Do NOT wrap or enclose the entire headline in book title marks (《》), quotation marks, or brackets. Avoid short, vague, or overly generic titles.
- "bullets": An array of ${bulletCountDesc} detailed, substantive bullet points summarizing the article in ${language}.

Summary and bullet point guidelines:
- Title Formatting: Output plain text headlines. NEVER wrap the entire title in 《...》, 「...」, or quotes. Book title marks 《...》 may only be used internally if citing a specific named report or publication within the title.
- Bullet Count: Provide ${bulletCountDesc} bullet points per article.
- Bullet Length: Each individual bullet point MUST contain between ${summarize_min_chars} and ${summarize_max_chars} characters. Avoid bullet points that are shorter than ${summarize_min_chars} characters or exceed ${summarize_max_chars} characters.
- Substantive & Informative: Each bullet point should be a rich, complete sentence providing specific facts, figures, key names, dates, quotes, context, and developments from the full article text.
- Comprehensive Depth: Do NOT write short or superficial fragments. Provide full journalistic context: What happened, why it matters, key background facts, and responses or future implications.
- Factual & Objective: Stick strictly to the facts provided in the text. No editorializing or speculation.
- Non-Redundant: Ensure each bullet covers distinct aspects (e.g. 1st bullet: main occurrence/finding; 2nd bullet: key details, figures, or names; 3rd bullet: background context, quotes, reactions, or next steps).
- Natural Flow: All titles and bullets MUST be written fluently in ${language}.

CRITICAL JSON SYNTAX & QUOTATION RULES:
1. STRICT JSON VALIDITY: Your response must be 100% valid, parseable JSON conforming strictly to {"items": [...]}.
2. QUOTATION ESCAPING & TITLE RULES (CRITICAL):
   - NEVER wrap the entire "title" string in outer quotes, brackets, or book title marks (e.g. do NOT return "《headline》" or "\"headline\"").
   - Inside string values (titles and bullets), NEVER use raw unescaped ASCII double quotes (").
   - When citing names, quotes, titles, or terms *inside* Chinese/Japanese/CJK text, use typographic marks such as 「...」, 『...』, 《...》, or "...".
   - In Western languages, use single quotes ('...') or properly escaped double quotes (\\\").
3. NO TRAILING COMMAS: Never put trailing commas after the last element in arrays or objects.
4. FINAL SYNTAX CHECK: Before finalizing your output, mentally validate the entire JSON string to ensure all quotes are properly closed/escaped, all braces and brackets match, and there are no syntax errors.
5. PURE JSON ONLY: Output ONLY the raw JSON object without markdown code blocks, backticks, or any preamble/postscript text. Do NOT use any markdown syntax such as bold (**), italic (*), headings (#), or lists (-) anywhere in your response. Your entire response must be valid, parseable JSON and nothing else.`;
};

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

async function summarizeEvents(
    items: Map<string, BriefNewsLike>,
    ai_client: AIClient,
    options: SummarizeNewsOptions
): Promise<Map<string, BriefNewsLike>> {
    if (items.size === 0)
        return items;
    const payload: string = JSON.stringify([...items.values()]);
    const res_schema = z.object({
        items: z.array(
            z.object({
                hash_id: z.string().nonempty(),
                title: z.string().nonempty(),
                bullets: z.array(z.string().nonempty()).min(options.summarize_min_bullets).max(options.summarize_max_bullets)
            })
        )
    });

    const res_data = await ai_client.ask(payload, getSummarizeInstruction(options), res_schema);

    const items_bullets = res_data.items;

    const output_items = new Map<string, BriefNewsLike>();

    items_bullets.forEach((item) => {
        if (!item.hash_id || !item.title || !item.bullets)
            return;
        const targetItem = items.get(item.hash_id);
        if (targetItem) {
            let cleanTitle = item.title.trim();
            if (
                (cleanTitle.startsWith('《') && cleanTitle.endsWith('》')) ||
                (cleanTitle.startsWith('「') && cleanTitle.endsWith('」')) ||
                (cleanTitle.startsWith('『') && cleanTitle.endsWith('』')) ||
                (cleanTitle.startsWith('"') && cleanTitle.endsWith('"')) ||
                (cleanTitle.startsWith("'") && cleanTitle.endsWith("'"))
            ) {
                cleanTitle = cleanTitle.slice(1, -1).trim();
            }
            targetItem.title = cleanTitle;
            targetItem.bullets = item.bullets.map((b) => b.trim());
            output_items.set(item.hash_id, targetItem);
        }
    });
    return output_items;
}

export default async function summarizeNews({ inputs, requires, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { summarize_input_items } = inputs as SummarizeNewsInput;
        const { ai_client } = requires as SummarizeNewsRequires;
        const summarize_options = options as SummarizeNewsOptions;
        const summarize_promises = Array.from(summarize_input_items.entries()).map(
            async ([category, items]): Promise<[NewsCategory, Map<string, BriefNewsLike>]> => {
                const summarized = await summarizeEvents(items, ai_client, summarize_options);
                return [category, summarized];
            }
        );
        const results = await Promise.all(summarize_promises);
        const summarized_items = new Map(results);
        if (summarize_options?.debug) {
            const inputCounts = Array.from(
                summarize_input_items.entries(),
                ([category, items]) => `${category}: ${items.size}`
            ).join(", ");
            const outputCounts = Array.from(
                summarized_items.entries(),
                ([category, items]) => `${category}: ${items.size}`
            ).join(", ");
            console.log(`[SUMMARIZE] Input items per category: ${inputCounts}`);
            console.log(`[SUMMARIZE] Output items per category: ${outputCounts}`);
        }
        const op_output: SummarizeNewsOutput = { summarized_items };
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

