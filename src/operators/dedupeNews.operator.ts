import * as z from "zod";
import { type NewsCategory, type BriefNewsLike } from "../types/brief_news.entity.js";
import { EventDeduplicator } from "../utils/dedupe.js";
import { AIClient } from "../types/ai_client.js";

const DedupeNewsInputSchema = z.object({
    read_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>),
    history_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type DedupeNewsInput = z.infer<typeof DedupeNewsInputSchema>;

const DedupeNewsOutputSchema = z.object({
    deduped_items: z.instanceof(Map<NewsCategory, Map<string, BriefNewsLike>>)
});
type DedupeNewsOutput = z.infer<typeof DedupeNewsOutputSchema>;

const DedupeNewsRequiresSchema = z.object({
    deduplicator: z.instanceof(EventDeduplicator),
    ai_client: z.instanceof(AIClient)
})
type DedupeNewsRequires = z.infer<typeof DedupeNewsRequiresSchema>;

//export default async function dedupeNews