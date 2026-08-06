import type { BriefNewsLike } from "../types/brief_news.entity.js";
import { type AIClient } from "../types/ai_client.base.js";
import * as z from "zod";

const DEDUPE_INSTRUCTION = `You are a news deduplication engine. You will receive a JSON object with two arrays:

- "fetched": Newly fetched news articles.
- "covered": News articles that have already been reported.

Each article has these fields: hash_id, url, title, source_date, source_name, category, and optionally bullets (summary points).

Your task is to identify which articles in "fetched" are redundant because they report on the **same underlying news event** as any article in "covered". Two articles cover the same event if they describe the same real-world occurrence — for example, the same incident, announcement, policy decision, or development — even if they are from different sources, use different wording, or focus on different angles of that event.

Do NOT consider articles as duplicates merely because they share the same broad topic or category. They must refer to the same specific event.

EXCEPTION — New Developments: If a fetched article covers the same event as a covered article but reports a **genuinely new development** — such as a newly announced outcome, a significant escalation, a reversal, an official response that was previously absent, or materially new facts — then do NOT mark it as redundant. However, apply this exception with extreme strictness. You must be highly certain that the article contains substantive new information that materially changes or advances the story. Minor additional details, reworded summaries, opinion commentary, or a different source reporting the same facts do NOT qualify as new developments. When in doubt, mark the article as redundant.

Respond with a JSON array containing ONLY the hash_id values of the redundant articles from the "fetched" list. If no articles are redundant, respond with an empty array [].`;

export class EventDeduplicator {

    public dedupeById(items: Map<string, BriefNewsLike>, covered_ids: string[]): Map<string, BriefNewsLike> {
        covered_ids.forEach((hash_id) => {
            items.delete(hash_id)
        });
        return items;
    }

    public async dedupeByEvent(items: Map<string, BriefNewsLike>, covered_items: Map<string, BriefNewsLike>, ai_client: AIClient): Promise<Map<string, BriefNewsLike>> {
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
        this.dedupeById(items, deduped_ids);
        return items;
    }
}