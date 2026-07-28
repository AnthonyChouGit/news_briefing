import { type BriefNews } from "../types/brief_news.entity.js";
import { type AIClient } from "../types/ai_client.interface.js";
import * as z from "zod";
import { ParseError, logExpectedError } from "./errors.js";

export const summarizeEvents = async (items: Map<string, BriefNews>, summary_ai_client: AIClient): Promise<Map<string, BriefNews>> => {
    if (items.size === 0)
        return items;
    const payload: string = JSON.stringify([...items.values()]);
    const res_schema = z.array(
        z.object({
            hash_id: z.enum([...items.keys()]),
            bullets: z.array(z.string().nonempty().max(50)).min(3).max(5)
        })
    ).length(items.size);

    const res_data = await summary_ai_client.ask(payload, res_schema);

    // Actually enforce the Zod validation!
    const items_bullets = res_schema.parse(JSON.parse(res_data));

    items_bullets.forEach((item) => {
        const targetItem = items.get(item.hash_id);
        if (targetItem) {
            targetItem.bullets = item.bullets;
        } else {
            logExpectedError(new ParseError(`[Summarize] AI returned an unknown hash_id: ${item.hash_id}`));
        }
    });
    return items;
}