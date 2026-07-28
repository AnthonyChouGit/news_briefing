import type { BriefNews } from "../types/brief_news.entity.js";
import { type AIClient } from "../types/ai_client.interface.js";
import * as z from "zod";

export const dedupeById = (items: Map<string, BriefNews>, covered_ids: string[]): Map<string, BriefNews> => {
    covered_ids.forEach((hash_id) => {
        items.delete(hash_id)
    });
    return items;
}

export const dedupeByEvent = async (items: Map<string, BriefNews>, covered_items: Map<string, BriefNews>, dedupe_ai_client: AIClient): Promise<Map<string, BriefNews>> => {
    if (items.size === 0 || covered_items.size === 0)
        return items;

    const res_schema = z.array(z.enum([...items.keys()]));
    const payload = {
        fetched: [...items.values()],
        covered: [...covered_items.values()]
    };
    const payload_json = JSON.stringify(payload);
    const response: string = await dedupe_ai_client.ask(payload_json, res_schema);
    const deduped_ids = res_schema.parse(JSON.parse(response));
    dedupeById(items, deduped_ids);
    return items;
}