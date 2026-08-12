import * as z from "zod";
import { type BriefNewsLike } from "../types/brief_news.entity.js";
import { type NewsCategory } from "../types/news_category.enum.js";
import { AIClient } from "../utils/ai.js";
import { type OperatorArgs, type OperatorOutput, Operator } from "../light-dag/operator.js";
import { type ErrorInfo, ErrorInfoSchema } from "./common/errors.js";

const DEDUPE_INSTRUCTION = `You are a news deduplication engine. You will receive a JSON object with two arrays:

- "fetched": Newly fetched news articles.
- "covered": News articles that have already been reported.

Each article has these fields: hash_id, url, title, source_date, source_name, category, and optionally bullets (summary points).

Your task is to identify which articles in "fetched" are redundant because they report on the **same underlying news event** as any article in "covered". Two articles cover the same event if they describe the same real-world occurrence — for example, the same incident, announcement, policy decision, or development — even if they are from different sources, use different wording, or focus on different angles of that event.

Do NOT consider articles as duplicates merely because they share the same broad topic or category. They must refer to the same specific event.

EXCEPTION — New Developments: If a fetched article covers the same event as a covered article but reports a **genuinely new development** — such as a newly announced outcome, a significant escalation, a reversal, an official response that was previously absent, or materially new facts — then do NOT mark it as redundant. However, apply this exception with extreme strictness. You must be highly certain that the article contains substantive new information that materially changes or advances the story. Minor additional details, reworded summaries, opinion commentary, or a different source reporting the same facts do NOT qualify as new developments. When in doubt, mark the article as redundant.

Respond with a JSON array containing ONLY the hash_id values of the redundant articles from the "fetched" list. If no articles are redundant, respond with an empty array [].`;

function dedupeById(items: Map<string, BriefNewsLike>, covered_ids: string[]): Map<string, BriefNewsLike> {
    covered_ids.forEach((hash_id) => {
        items.delete(hash_id)
    });
    return items;
}

async function dedupeByEvent(items: Map<string, BriefNewsLike>, covered_items: Map<string, BriefNewsLike>, ai_client: AIClient): Promise<Map<string, BriefNewsLike>> {
    if (items.size === 0 || covered_items.size === 0)
        return items;

    const res_schema = z.array(z.enum([...items.keys()]));
    const payload = {
        fetched: [...items.values()],
        covered: [...covered_items.values()]
    };
    const payload_json = JSON.stringify(payload);
    const response: string = await ai_client.ask(payload_json, DEDUPE_INSTRUCTION, res_schema);
    const deduped_ids = res_schema.parse(JSON.parse(response));
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

export default async function dedupeNews({ inputs, requires }: OperatorArgs): Promise<OperatorOutput> {
    try {
        const { dedupe_input_items, history_items } = inputs as DedupeNewsInput;
        const { ai_client } = requires as DedupeNewsRequires;
        const dedupePromises = Array.from(dedupe_input_items.entries(),
            async ([category, items]) => {
                if (history_items.has(category)) {
                    dedupeById(items, Array.from(history_items.get(category)!.keys()));
                    await dedupeByEvent(items, history_items.get(category)!, ai_client);
                }
            }
        );
        await Promise.all(dedupePromises);
        const op_output: DedupeNewsOutput = { deduped_items: dedupe_input_items };
        return { branch: "default", output: op_output };

    } catch (error) {
        const err_output: ErrorInfo = { err_code: 2, err_obj: error };
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