import * as z from "zod";
import { type BriefNewsLike } from "../types/brief_news.entity.js";
import { type NewsCategory } from "../types/news_category.enum.js";
import { AIClient } from "../utils/ai.js";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";

const DEDUPE_INSTRUCTION = `You are a news deduplication engine. You will receive a JSON object with two arrays:

- "fetched": Newly fetched news articles.
- "covered": News articles that have already been reported in previous briefings.

Each article has these fields: hash_id, url, title, source_date, source_name, category, and optionally bullets (summary points).

Your task is to identify which articles in "fetched" are redundant and return their hash_id values. Redundancy occurs in two ways:

1. Redundancy against "covered" (Cross-Source / History Duplication):
An article in "fetched" is redundant if it reports on the **same underlying news event** as any article in "covered". Two articles cover the same event if they describe the same real-world occurrence — for example, the same incident, announcement, policy decision, sporting event, scientific discovery, or geopolitical development — even if they are from different sources, use different wording, or focus on different angles of that event.
Do NOT consider articles as duplicates merely because they share the same broad topic or category; they must refer to the same specific event.

EXCEPTION — New Developments: If a fetched article covers the same event as a covered article but reports a **genuinely new development** — such as a newly announced outcome, a significant escalation, a reversal, an official response that was previously absent, or materially new facts — then do NOT mark it as redundant. However, apply this exception with extreme strictness. You must be highly certain that the article contains substantive new information that materially changes or advances the story. Minor additional details, reworded summaries, opinion commentary, or a different source reporting the same facts do NOT qualify as new developments. When in doubt, mark the article as redundant.

2. Duplication within "fetched" (Intra-Batch Duplication):
Multiple articles within "fetched" may report on the **same underlying news event** (for example, the same event reported by multiple news sources, or multiple news items tracking different development stages of the same event).
For any cluster of articles in "fetched" covering the same event:
- Keep ONLY the single **latest item with the latest development stage** (the one representing the most advanced stage of the event and the most up-to-date information, taking into account the reported developments and source_date).
- Mark all other earlier, redundant, or multi-source duplicate articles in "fetched" for that event as redundant (include their hash_id values in the output).

3. Combined Scenario:
If an event appears in "covered" and also has multiple articles in "fetched":
- If none of the fetched articles report a genuinely new development compared to "covered", mark ALL fetched articles for that event as redundant.
- If one or more fetched articles report a genuinely new development compared to "covered", keep ONLY the single latest item with the latest development stage among them, and mark all other fetched articles for that event as redundant.

Respond with a JSON object containing an "ids" array with ONLY the hash_id values of the redundant articles from the "fetched" list (e.g. {"ids": ["hash1", "hash2"]}). If no articles are redundant, respond with {"ids": []}.

CRITICAL OUTPUT FORMAT RULES:
- Output ONLY the raw JSON object. Do NOT wrap it in markdown code blocks, backticks, or any other formatting.
- Do NOT use any markdown syntax such as bold (**), italic (*), headings (#), or lists (-) anywhere in your response.
- Your entire response must be valid, parseable JSON and nothing else.`;

function dedupeById(items: Map<string, BriefNewsLike>, covered_ids: string[]): Map<string, BriefNewsLike> {
    covered_ids.forEach((hash_id) => {
        items.delete(hash_id)
    });
    return items;
}

async function dedupeByEvent(items: Map<string, BriefNewsLike>, covered_items: Map<string, BriefNewsLike>, ai_client: AIClient): Promise<Map<string, BriefNewsLike>> {
    if (items.size === 0 || (items.size <= 1 && covered_items.size === 0))
        return items;

    const res_schema = z.object({
        ids: z.array(z.string())
    });
    const payload = {
        fetched: [...items.values()],
        covered: [...covered_items.values()]
    };
    const payload_json = JSON.stringify(payload);
    const response = await ai_client.ask(payload_json, DEDUPE_INSTRUCTION, res_schema);
    const deduped_ids = response.ids;
    dedupeById(items, deduped_ids);
    return items;
}

const DedupeNewsInputSchema = z.object({
    dedupe_input_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>),
    history_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type DedupeNewsInput = z.infer<typeof DedupeNewsInputSchema>;

const DedupeNewsOutputSchema = z.object({
    deduped_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type DedupeNewsOutput = z.infer<typeof DedupeNewsOutputSchema>;

const DedupeNewsRequiresSchema = z.object({
    ai_client: z.instanceof(AIClient)
});
type DedupeNewsRequires = z.infer<typeof DedupeNewsRequiresSchema>;

export default async function dedupeNews({ inputs, requires, options }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { dedupe_input_items, history_items } = inputs as DedupeNewsInput;
        const { ai_client } = requires as DedupeNewsRequires;
        const dedupe_options = options as DedupeNewsOptions;
        const isDebug = dedupe_options?.debug;
        let totalBefore = 0;
        if (isDebug) {
            totalBefore = Array.from(dedupe_input_items.values()).reduce((sum, map) => sum + map.size, 0);
        }

        const dedupePromises = Array.from(dedupe_input_items.entries(),
            async ([category, items]) => {
                const history_for_category = history_items.get(category);
                if (history_for_category && history_for_category.size > 0) {
                    dedupeById(items, Array.from(history_for_category.keys()));
                }
                const covered_map = history_for_category ?? new Map<string, BriefNewsLike>();
                await dedupeByEvent(items, covered_map, ai_client);
            }
        );
        await Promise.all(dedupePromises);

        if (isDebug) {
            const remainingCounts = Array.from(
                dedupe_input_items.entries(),
                ([category, items]) => `${category}: ${items.size}`
            ).join(", ");
            const totalAfter = Array.from(dedupe_input_items.values()).reduce((sum, map) => sum + map.size, 0);
            const dedupedCount = totalBefore - totalAfter;
            console.log(`[DEDUPE] Total items deduped: ${dedupedCount} (remaining: ${totalAfter}, per category: ${remainingCounts})`);
        }

        const op_output: DedupeNewsOutput = { deduped_items: dedupe_input_items };
        return { branch: "default", output: op_output };

    } catch (error) {
        const err_output: ErrorInfo = { err_code: 2, err_obj: error };
        return { branch: "error", output: err_output };
    }
}

export const DedupeNewsOptionsSchema = z.object({
    debug: z.boolean().default(false)
});
export type DedupeNewsOptions = z.infer<typeof DedupeNewsOptionsSchema>;

export class DedupeNewsOperator extends Operator {
    name: string = "dedupe_news";
    input_schema = DedupeNewsInputSchema;
    output_schemas = { default: DedupeNewsOutputSchema, error: ErrorInfoSchema };
    requires_schema = DedupeNewsRequiresSchema;
    options_schema = DedupeNewsOptionsSchema;
    exec = dedupeNews;
}