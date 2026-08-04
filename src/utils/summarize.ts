import { type BriefNewsLike } from "../types/brief_news.entity.js";
import { type AIClient } from "../types/ai_client.js";
import * as z from "zod";
import { ParseError, logExpectedError } from "./errors.js";

const SUMMARIZE_INSTRUCTION = `You are a news summarization engine. You will receive a JSON array of news articles. Each article has the following fields: hash_id, url, title, source_date, source_name, category, and raw (the full article text).

For EVERY article in the input, produce a concise summary as bullet points. You must return a JSON array with exactly one entry per input article, in the same order. Each entry must have:

- "hash_id": The exact hash_id of the article (do not modify or generate new IDs).
- "bullets": An array of 3 to 5 bullet points summarizing the article.

Bullet point rules:
- Each bullet must be a single, complete sentence or phrase that captures one key fact or takeaway.
- Each bullet must be between 10 and 50 characters long. This is a hard limit — do not exceed it or fall short.
- Bullets should be informative and specific. Avoid vague or generic statements like "The article discusses..." or "Details were provided."
- Prioritize the most newsworthy facts: who, what, when, where, and why.
- Do not repeat information across bullets.
- Do not include opinions or editorializing. Stick to factual reporting.

Respond with ONLY the JSON array. Do not include any other text, explanation, or formatting.`;

export class NewsSummarizer {

    public async summarizeEvents(items: Map<string, BriefNewsLike>, ai_client: AIClient): Promise<Map<string, BriefNewsLike>> {
        if (items.size === 0)
            return items;
        const payload: string = JSON.stringify([...items.values()]);
        const res_schema = z.array(
            z.object({
                hash_id: z.enum([...items.keys()]),
                bullets: z.array(z.string().nonempty().min(10).max(50)).min(3).max(5)
            })
        ).length(items.size);

        const res_data = await ai_client.ask(payload, SUMMARIZE_INSTRUCTION, res_schema);

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
}